import { NextResponse } from "next/server";
import { z } from "zod";
import { errorMessage } from "@/lib/http";
import { geocodeQuery, type GeoPoint } from "@/lib/geocoding";
import {
  callLLM,
  type PlanJourneyOutput,
  type NarrateStopContext,
} from "@/lib/llm";
import { getServerSupabase } from "@/lib/supabase-server";

// Schema for the incoming request
const GenerateRequestSchema = z.object({
  prompt: z.string().trim().min(3, "Prompt must be at least 3 characters").max(500),
});

export type GeneratedStop = {
  site_id: string;
  name: string;
  slug: string;
  category: string;
  era: string | null;
  lat: number;
  lng: number;
  district: string | null;
  state: string | null;
  blurb: string;
  leg_km: number;
};

export type GeneratedDay = {
  day: number;
  stops: GeneratedStop[];
};

export type GeneratedJourneyResponse = {
  ok: boolean;
  title: string;
  intro: string;
  days: GeneratedDay[];
  total_km: number;
  route_geojson: {
    type: "LineString";
    coordinates: [number, number][];
  };
  flagged: boolean;
  empty?: boolean;
  message?: string;
  cached?: boolean;
  parsed?: {
    theme: string;
    origin: string | null;
    days: number;
    era?: string | null;
    category?: string | null;
  };
  origin?: {
    name: string | null;
    lat: number;
    lng: number;
    displayName: string | null;
  } | null;
};

/* =========================================================================
 * Rate-limiting and Cache (in-memory, sliding window per IP + TTL cache)
 * ========================================================================= */

type CacheEntry = {
  data: GeneratedJourneyResponse;
  expiresAt: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;

const promptCache = new Map<string, CacheEntry>();
const rateLimitMap = new Map<string, number[]>();

function normalizePrompt(p: string): string {
  return p.toLowerCase().trim().replace(/\s+/g, " ");
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitMap.set(ip, timestamps);
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

/* =========================================================================
 * Distance helpers (Haversine in km)
 * ========================================================================= */

function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^([^.!?]+[.!?])/);
  if (match) return match[1].trim();
  return trimmed.slice(0, 160).trim();
}

/* =========================================================================
 * Candidate retrieval and clustering logic
 * ========================================================================= */

type CandidateSite = {
  id: string;
  name: string;
  slug: string;
  category: string;
  era: string | null;
  state: string | null;
  district: string | null;
  crafts: string[] | null;
  lat: number;
  lng: number;
  snippet: string | null;
  summary_en: string | null;
  description_en: string | null;
  distance_m: number | null;
  score: number;
};

/**
 * Deterministically cluster candidates into `k` days with at most 3 stops per day,
 * then order each day by nearest-neighbor.
 */
function clusterAndOrderItinerary(
  candidates: CandidateSite[],
  targetDays: number,
  origin: GeoPoint | null,
): GeneratedDay[] {
  if (candidates.length === 0) return [];

  // 1. Take top stops needed (at most 3 stops per day)
  const maxStops = targetDays * 3;
  const selected = candidates.slice(0, maxStops);

  // If fewer stops than requested days, adjust days so each day has at least 1 stop
  const actualDays = Math.min(targetDays, selected.length);
  if (actualDays <= 1) {
    // Single day: order all by nearest neighbor from origin
    const ordered = orderStopsNearestNeighbor(
      selected,
      origin ?? { lat: selected[0].lat, lng: selected[0].lng },
    );
    return [
      {
        day: 1,
        stops: computeLegs(ordered, origin),
      },
    ];
  }

  // 2. Multi-day spatial clustering using K-Means on (lat, lng)
  // Sort initial centroids by distance from origin (or latitude)
  const refPoint = origin ?? { lat: selected[0].lat, lng: selected[0].lng };
  const sortedByDist = [...selected].sort((a, b) => {
    const da = haversineDistanceKm(refPoint.lat, refPoint.lng, a.lat, a.lng);
    const db = haversineDistanceKm(refPoint.lat, refPoint.lng, b.lat, b.lng);
    return da - db;
  });

  // Pick initial centroids spread across the candidates
  let centroids: GeoPoint[] = [];
  for (let i = 0; i < actualDays; i++) {
    const idx = Math.min(
      sortedByDist.length - 1,
      Math.floor((i * sortedByDist.length) / actualDays),
    );
    centroids.push({
      lat: sortedByDist[idx].lat,
      lng: sortedByDist[idx].lng,
    });
  }

  // Run K-Means iterations
  const MAX_ITER = 12;
  let clusters: CandidateSite[][] = Array.from({ length: actualDays }, () => []);

  for (let iter = 0; iter < MAX_ITER; iter++) {
    clusters = Array.from({ length: actualDays }, () => []);

    for (const site of selected) {
      let nearestIdx = 0;
      let minDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = haversineDistanceKm(
          centroids[c].lat,
          centroids[c].lng,
          site.lat,
          site.lng,
        );
        if (d < minDist) {
          minDist = d;
          nearestIdx = c;
        }
      }
      clusters[nearestIdx].push(site);
    }

    // Recompute centroids
    const newCentroids: GeoPoint[] = [];
    for (let c = 0; c < actualDays; c++) {
      if (clusters[c].length > 0) {
        const avgLat =
          clusters[c].reduce((acc, s) => acc + s.lat, 0) / clusters[c].length;
        const avgLng =
          clusters[c].reduce((acc, s) => acc + s.lng, 0) / clusters[c].length;
        newCentroids.push({ lat: avgLat, lng: avgLng });
      } else {
        newCentroids.push(centroids[c]);
      }
    }
    centroids = newCentroids;
  }

  // 3. Balance clusters: ensure at most 3 stops per day and no empty cluster if points exist
  // First, if any cluster is empty, take a point from the largest cluster (> 1 point)
  for (let c = 0; c < actualDays; c++) {
    if (clusters[c].length === 0) {
      let largestIdx = -1;
      let largestLen = 1;
      for (let j = 0; j < actualDays; j++) {
        if (clusters[j].length > largestLen) {
          largestLen = clusters[j].length;
          largestIdx = j;
        }
      }
      if (largestIdx >= 0) {
        const stolen = clusters[largestIdx].pop();
        if (stolen) clusters[c].push(stolen);
      }
    }
  }

  // Next, if any cluster has > 3 stops, redistribute the furthest points to clusters with < 3 stops
  for (let c = 0; c < actualDays; c++) {
    while (clusters[c].length > 3) {
      // Find the stop furthest from centroid c
      const centroid = centroids[c];
      let furthestIdx = 0;
      let maxD = -1;
      for (let i = 0; i < clusters[c].length; i++) {
        const d = haversineDistanceKm(
          centroid.lat,
          centroid.lng,
          clusters[c][i].lat,
          clusters[c][i].lng,
        );
        if (d > maxD) {
          maxD = d;
          furthestIdx = i;
        }
      }
      const [overflow] = clusters[c].splice(furthestIdx, 1);

      // Find nearest cluster with < 3 stops
      let targetIdx = -1;
      let bestDist = Infinity;
      for (let j = 0; j < actualDays; j++) {
        if (j !== c && clusters[j].length < 3) {
          const d = haversineDistanceKm(
            centroids[j].lat,
            centroids[j].lng,
            overflow.lat,
            overflow.lng,
          );
          if (d < bestDist) {
            bestDist = d;
            targetIdx = j;
          }
        }
      }

      if (targetIdx >= 0) {
        clusters[targetIdx].push(overflow);
      } else {
        // Can't place, drop from itinerary
        break;
      }
    }
  }

  // Remove any accidentally empty clusters
  const validClusters = clusters.filter((cl) => cl.length > 0);

  // 4. Order clusters chronologically starting nearest to origin
  const orderedClusters: CandidateSite[][] = [];
  const remainingClusters = [...validClusters];
  let currentPos = refPoint;

  while (remainingClusters.length > 0) {
    let nearestClIdx = 0;
    let minClDist = Infinity;
    for (let i = 0; i < remainingClusters.length; i++) {
      const cl = remainingClusters[i];
      // Compute cluster center
      const clLat = cl.reduce((s, p) => s + p.lat, 0) / cl.length;
      const clLng = cl.reduce((s, p) => s + p.lng, 0) / cl.length;
      const dist = haversineDistanceKm(currentPos.lat, currentPos.lng, clLat, clLng);
      if (dist < minClDist) {
        minClDist = dist;
        nearestClIdx = i;
      }
    }
    const [nextCl] = remainingClusters.splice(nearestClIdx, 1);
    orderedClusters.push(nextCl);
    // Update currentPos to the center of the added cluster
    currentPos = {
      lat: nextCl.reduce((s, p) => s + p.lat, 0) / nextCl.length,
      lng: nextCl.reduce((s, p) => s + p.lng, 0) / nextCl.length,
    };
  }

  // 5. Order each day's stops by nearest neighbor starting from origin (Day 1) or previous day's end
  const daysResult: GeneratedDay[] = [];
  let dayStartPos = refPoint;

  for (let dayIdx = 0; dayIdx < orderedClusters.length; dayIdx++) {
    const rawStops = orderedClusters[dayIdx];
    const orderedStops = orderStopsNearestNeighbor(rawStops, dayStartPos);

    const prevAnchor = dayIdx === 0 ? origin : dayStartPos;
    const stopsWithLegs = computeLegs(orderedStops, prevAnchor);

    daysResult.push({
      day: dayIdx + 1,
      stops: stopsWithLegs,
    });

    if (orderedStops.length > 0) {
      const lastStop = orderedStops[orderedStops.length - 1];
      dayStartPos = { lat: lastStop.lat, lng: lastStop.lng };
    }
  }

  return daysResult;
}

function orderStopsNearestNeighbor(
  stops: CandidateSite[],
  startPos: GeoPoint,
): CandidateSite[] {
  const remaining = [...stops];
  const ordered: CandidateSite[] = [];
  let current = startPos;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineDistanceKm(
        current.lat,
        current.lng,
        remaining[i].lat,
        remaining[i].lng,
      );
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    }
    const [picked] = remaining.splice(nearestIdx, 1);
    ordered.push(picked);
    current = { lat: picked.lat, lng: picked.lng };
  }

  return ordered;
}

function computeLegs(
  stops: CandidateSite[],
  anchorStart: GeoPoint | null,
): GeneratedStop[] {
  let prevPos = anchorStart;

  return stops.map((s) => {
    let leg_km = 0;
    if (prevPos) {
      leg_km = haversineDistanceKm(prevPos.lat, prevPos.lng, s.lat, s.lng);
    }
    prevPos = { lat: s.lat, lng: s.lng };

    // Default grounded blurb
    const genericBlurb = s.summary_en
      ? firstSentence(s.summary_en)
      : `${s.name} is a notable ${s.era ? `${s.era} ` : ""}${s.category} located in ${[s.district, s.state].filter(Boolean).join(", ") || "India"}.`;

    return {
      site_id: s.id,
      name: s.name,
      slug: s.slug,
      category: s.category,
      era: s.era,
      lat: s.lat,
      lng: s.lng,
      district: s.district,
      state: s.state,
      blurb: genericBlurb,
      leg_km,
    };
  });
}

/* =========================================================================
 * POST Handler
 * ========================================================================= */

export async function POST(req: Request) {
  // 1. Rate-limiting
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Too many requests. Please wait a minute before generating another itinerary.",
      },
      { status: 429 },
    );
  }

  // 2. Parse request body
  const rawBody: unknown = await req.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object") {
    return NextResponse.json(
      { ok: false, error: "Body must be valid JSON object with a 'prompt' field" },
      { status: 400 },
    );
  }

  const parsedBody = GenerateRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsedBody.error.issues.map((i) => i.message).join("; "),
      },
      { status: 400 },
    );
  }

  const prompt = parsedBody.data.prompt;
  const normPrompt = normalizePrompt(prompt);

  // 3. Cache check
  const cached = promptCache.get(normPrompt);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json({
      ...cached.data,
      cached: true,
    });
  }

  try {
    const db = getServerSupabase();

    // 4. LLM Task 1: plan_journey (Zod-validated)
    let planOutput: PlanJourneyOutput;
    let fallbackPlan = false;

    try {
      const planRes = await callLLM("plan_journey", { prompt });
      planOutput = planRes.output;
    } catch (e) {
      console.warn("[journey planner] plan_journey LLM failed, using fallback:", errorMessage(e));
      fallbackPlan = true;
      planOutput = {
        theme: prompt,
        region_or_origin: null,
        days: 2,
        era: null,
        category: null,
      };
    }

    const theme = planOutput.theme.trim() || prompt;
    const originStr = planOutput.region_or_origin?.trim() || null;
    const targetDays = Math.min(7, Math.max(1, planOutput.days || 2));
    const eraFilter = planOutput.era?.trim() || null;
    const categoryFilter = planOutput.category || null;

    // 5. Geocode origin if specified
    let originPoint: (GeoPoint & { displayName: string | null }) | null = null;
    if (originStr) {
      try {
        const geoRes = await geocodeQuery(db, originStr);
        if (geoRes.point) {
          originPoint = {
            ...geoRes.point,
            displayName: geoRes.displayName,
          };
        }
      } catch (e) {
        console.warn(`[journey planner] could not geocode origin "${originStr}":`, errorMessage(e));
      }
    }

    // 6. Embed theme (best effort)
    let queryEmbedding: string | null = null;
    try {
      const er = await callLLM("embed", {
        texts: [theme],
        purpose: "query",
      });
      queryEmbedding = JSON.stringify(er.output.vectors[0]);
    } catch (e) {
      console.warn("[journey planner] embedding failed, using text-only search:", errorMessage(e));
    }

    // 7. Retrieve candidate sites using search_sites RPC
    // Sensible radius around origin (e.g. 150km - 350km based on days)
    const sensibleRadiusKm = Math.min(500, Math.max(150, targetDays * 120));
    const centerEwkt = originPoint
      ? `SRID=4326;POINT(${originPoint.lng} ${originPoint.lat})`
      : null;
    const radiusM = originPoint ? sensibleRadiusKm * 1000 : null;

    const searchFilters: Record<string, string> = {};
    if (categoryFilter) searchFilters.type = categoryFilter;
    if (eraFilter) searchFilters.era = eraFilter;

    // First attempt: with radius and filters
    let { data: candidateRows, error: searchErr } = await db.rpc("search_sites", {
      query_embedding: queryEmbedding,
      query_text: theme,
      center: centerEwkt,
      radius_m: radiusM,
      filters: searchFilters,
      match_count: Math.max(25, targetDays * 4),
      filter_types: categoryFilter ? [categoryFilter] : null,
      filter_crafts: null,
      filter_eras: null,
    });

    if (searchErr) {
      console.warn("[journey planner] search_sites error:", searchErr.message);
    }

    let rows = (candidateRows ?? []) as Array<{
      site_id: string;
      slug: string;
      name: string;
      type: string;
      era: string | null;
      state: string | null;
      district: string | null;
      crafts: string[] | null;
      lat: number | null;
      lng: number | null;
      snippet: string | null;
      distance_m: number | null;
      score: number;
    }>;

    // Filter to rows with valid coordinates
    let validSites = rows.filter((r) => r.lat !== null && r.lng !== null);

    // If fewer than 2 sites found, retry with relaxed radius / filters
    if (validSites.length < 2) {
      const { data: relaxedRows } = await db.rpc("search_sites", {
        query_embedding: queryEmbedding,
        query_text: theme,
        center: null, // relax radius constraint
        radius_m: null,
        filters: {}, // relax strict category/era
        match_count: 25,
        filter_types: null,
        filter_crafts: null,
        filter_eras: null,
      });

      if (relaxedRows && relaxedRows.length > 0) {
        validSites = (relaxedRows as typeof rows).filter(
          (r) => r.lat !== null && r.lng !== null,
        );
      }
    }

    // Empty state: no matching sites in database
    if (validSites.length === 0) {
      const emptyResponse: GeneratedJourneyResponse = {
        ok: true,
        empty: true,
        message: "No matching sites yet, try a broader theme",
        title: `${targetDays}-Day Journey`,
        intro: "No matching heritage records found in the database. Try expanding your search topic or destination.",
        days: [],
        total_km: 0,
        route_geojson: {
          type: "LineString",
          coordinates: [],
        },
        flagged: false,
        parsed: {
          theme,
          origin: originStr,
          days: targetDays,
          era: eraFilter,
          category: categoryFilter,
        },
        origin: originPoint
          ? {
              name: originStr,
              lat: originPoint.lat,
              lng: originPoint.lng,
              displayName: originPoint.displayName,
            }
          : null,
      };

      return NextResponse.json(emptyResponse);
    }

    // 8. Fetch stored fields for narration grounding (summary_en, description_en)
    const siteIds = validSites.map((s) => s.site_id);
    const { data: fullSitesData } = await db
      .from("sites")
      .select("id, summary_en, description_en")
      .in("id", siteIds);

    const summariesById = new Map<string, { summary_en: string | null; description_en: string | null }>();
    for (const fs of fullSitesData ?? []) {
      summariesById.set(fs.id, {
        summary_en: fs.summary_en,
        description_en: fs.description_en,
      });
    }

    const candidates: CandidateSite[] = validSites.map((s) => {
      const extra = summariesById.get(s.site_id);
      return {
        id: s.site_id,
        name: s.name,
        slug: s.slug,
        category: s.type,
        era: s.era,
        state: s.state,
        district: s.district,
        crafts: s.crafts,
        lat: s.lat as number,
        lng: s.lng as number,
        snippet: s.snippet,
        summary_en: extra?.summary_en ?? s.snippet,
        description_en: extra?.description_en ?? null,
        distance_m: s.distance_m,
        score: s.score,
      };
    });

    // 9. Deterministic Clustering and Ordering
    const days = clusterAndOrderItinerary(candidates, targetDays, originPoint);

    // 10. Compute total distance & GeoJSON LineString
    let totalKm = 0;
    const routeCoords: [number, number][] = [];

    if (originPoint) {
      routeCoords.push([originPoint.lng, originPoint.lat]);
    }

    for (const d of days) {
      for (const s of d.stops) {
        totalKm += s.leg_km;
        routeCoords.push([s.lng, s.lat]);
      }
    }
    totalKm = Math.round(totalKm * 10) / 10;

    // 11. LLM Narration (strictly grounded)
    let flagged = fallbackPlan;
    let title = `${days.length}-Day ${theme.replace(/\b\w/g, (c) => c.toUpperCase())} Route`;
    let intro = `A curated ${days.length}-day journey exploring ${theme}${originStr ? ` starting from ${originStr}` : ""}.`;

    const candidateIdsSet = new Set(days.flatMap((d) => d.stops.map((s) => s.site_id)));

    const narrationStops: NarrateStopContext[] = days.flatMap((d) =>
      d.stops.map((s) => ({
        site_id: s.site_id,
        name: s.name,
        category: s.category,
        era: s.era,
        district: s.district,
        state: s.state,
        summary: s.blurb,
      })),
    );

    try {
      const narrationRes = await callLLM("narrate_journey", {
        prompt,
        theme,
        origin: originStr,
        days: days.map((d) => ({
          day: d.day,
          stops: d.stops.map((s) => ({
            site_id: s.site_id,
            name: s.name,
            category: s.category,
            era: s.era,
            district: s.district,
            state: s.state,
            summary: s.blurb,
          })),
        })),
      });

      const nar = narrationRes.output;
      if (nar.title && nar.title.trim()) title = nar.title.trim();
      if (nar.intro && nar.intro.trim()) intro = nar.intro.trim();

      // Validate & ground stop blurbs: match only candidate IDs, drop or repair unknown IDs
      const blurbMap = new Map<string, string>();
      for (const st of nar.stops ?? []) {
        if (!st.blurb || !st.blurb.trim()) continue;
        const rawId = st.site_id.trim();

        if (candidateIdsSet.has(rawId)) {
          blurbMap.set(rawId, st.blurb.trim());
        } else {
          // Repair attempt: match by slug or lowercased name if LLM substituted name
          const matchedCandidate = narrationStops.find(
            (c) =>
              c.name.toLowerCase() === rawId.toLowerCase() ||
              c.site_id.toLowerCase() === rawId.toLowerCase(),
          );
          if (matchedCandidate) {
            blurbMap.set(matchedCandidate.site_id, st.blurb.trim());
          }
        }
      }

      // Assign blurbs to stops
      for (const d of days) {
        for (const s of d.stops) {
          const aiBlurb = blurbMap.get(s.site_id);
          if (aiBlurb) {
            s.blurb = aiBlurb;
          }
        }
      }
    } catch (e) {
      console.warn("[journey planner] narrate_journey failed, returning deterministic itinerary with generic blurbs:", errorMessage(e));
      flagged = true;
    }

    const responsePayload: GeneratedJourneyResponse = {
      ok: true,
      title,
      intro,
      days,
      total_km: totalKm,
      route_geojson: {
        type: "LineString",
        coordinates: routeCoords,
      },
      flagged,
      parsed: {
        theme,
        origin: originStr,
        days: days.length,
        era: eraFilter,
        category: categoryFilter,
      },
      origin: originPoint
        ? {
            name: originStr,
            lat: originPoint.lat,
            lng: originPoint.lng,
            displayName: originPoint.displayName,
          }
        : null,
    };

    // Cache the successful generation
    promptCache.set(normPrompt, {
      data: responsePayload,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return NextResponse.json(responsePayload);
  } catch (err) {
    console.error("[api/journeys/generate]", err);
    return NextResponse.json(
      { ok: false, error: errorMessage(err) },
      { status: 500 },
    );
  }
}
