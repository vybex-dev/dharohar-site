// app/api/search/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES, ERA_BUCKETS, type SearchResultDto } from "@/lib/facets";
import { errorMessage } from "@/lib/http";
import { geocodeQuery } from "@/lib/geocoding";
import { callLLM } from "@/lib/llm";
import { getServerSupabase } from "@/lib/supabase-server";

// No route segment config: cacheComponents rejects `dynamic`, `revalidate`, etc.

const QuerySchema = z.object({
  q: z.string().trim().min(1, "Query cannot be empty").max(500),
  // UI filters: repeat the param to select several (?type=fort&type=temple).
  // AND across facets, OR within one. They override the LLM-parsed type/era.
  type: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length).default([]),
  era: z.array(z.enum(ERA_BUCKETS)).max(ERA_BUCKETS.length).default([]),
  craft: z
    .array(z.string().trim().min(1).max(60).transform((s) => s.toLowerCase()))
    .max(10)
    .default([]),
});

const DEFAULT_RADIUS_KM = 50; // applied when a place is named but no radius was stated
const MAX_RADIUS_KM = 500;
const MATCH_COUNT = 20;

type ParsedQuery = {
  language: "en" | "hi" | "gu" | "other";
  topic: string;
  topic_en: string;
  topic_original: string;
  place: string | null;
  radius_km: number | null;
  era: string | null;
  type: string | null;
};

/** Safe fallback for when the LLM chain is unavailable: treat the whole raw
 *  query as the topic, with no place/era/type/radius filters. */
function fallbackParse(rawQuery: string): ParsedQuery {
  return {
    language: "en",
    topic: rawQuery,
    topic_en: rawQuery,
    topic_original: rawQuery,
    place: null,
    radius_km: null,
    era: null,
    type: null,
  };
}

async function parseSearchQuery(
  rawQuery: string,
): Promise<{
  parsed: ParsedQuery;
  usedFallback: boolean;
  parseError?: string;
}> {
  try {
    const r = await callLLM("parse_query", { query: rawQuery });
    return {
      parsed: {
        language: r.output.language,
        topic: r.output.topic,
        topic_en: r.output.topic_en,
        topic_original: r.output.topic_original,
        place: r.output.place,
        radius_km: r.output.radius_km,
        era: r.output.era,
        type: r.output.type,
      },
      usedFallback: false,
    };
  } catch (e) {
    console.warn(
      "[search] parse_query failed, falling back to raw-text search:",
      errorMessage(e),
    );
    return {
      parsed: fallbackParse(rawQuery),
      usedFallback: true,
      parseError: errorMessage(e),
    };
  }
}

// Row shape returned by search_sites() (sql/008_search_v2.sql).
type SiteResultRow = SearchResultDto;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsedParams = QuerySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    type: url.searchParams.getAll("type"),
    era: url.searchParams.getAll("era"),
    craft: url.searchParams.getAll("craft"),
  });
  if (!parsedParams.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsedParams.error.issues.map((i) => i.message).join("; "),
      },
      { status: 400 },
    );
  }
  const rawQuery = parsedParams.data.q;
  const uiTypes = parsedParams.data.type;
  const uiEras = parsedParams.data.era;
  const uiCrafts = parsedParams.data.craft;

  try {
    const db = getServerSupabase();

    const { parsed, usedFallback, parseError } =
      await parseSearchQuery(rawQuery);

    const topicEn = parsed.topic_en.trim();
    const topicOriginal = parsed.topic_original.trim();
    const place = parsed.place?.trim() || null;
    const isNonEnglish = parsed.language !== "en";

    // Effective English topic for embedding + English FTS.
    const effectiveTopicEn = topicEn || (!place ? rawQuery : "");

    // For non-English queries, embed the original-script text as a second signal.
    // Identical to topic_en in fallback/English paths — skip it to avoid duplicate work.
    const effectiveTopicOriginal =
      isNonEnglish && topicOriginal && topicOriginal !== topicEn
        ? topicOriginal
        : null;

    // ── Embeddings (best-effort; failure degrades only semantic ranking) ──────
    let queryEmbeddingEn: string | null = null;
    let queryEmbeddingOrig: string | null = null;

    if (effectiveTopicEn) {
      try {
        const er = await callLLM("embed", {
          texts: [effectiveTopicEn],
          purpose: "query",
        });
        queryEmbeddingEn = JSON.stringify(er.output.vectors[0]);
      } catch (e) {
        console.warn(
          "[search] English embedding failed, continuing without semantic ranking:",
          errorMessage(e),
        );
      }
    }

    if (effectiveTopicOriginal) {
      try {
        const er = await callLLM("embed", {
          texts: [effectiveTopicOriginal],
          purpose: "query",
        });
        queryEmbeddingOrig = JSON.stringify(er.output.vectors[0]);
      } catch (e) {
        console.warn(
          "[search] Original-script embedding failed, skipping secondary semantic signal:",
          errorMessage(e),
        );
      }
    }

    // ── Geocode place (best-effort) ──────────────────────────────────────────
    let center: string | null = null;
    let radiusM: number | null = null;
    let placeResolved: string | null = null;
    let placeNotFound = false;
    if (place) {
      try {
        const g = await geocodeQuery(db, place);
        if (g.point) {
          center = `SRID=4326;POINT(${g.point.lng} ${g.point.lat})`;
          placeResolved = g.displayName;
          const km =
            parsed.radius_km && parsed.radius_km > 0
              ? Math.min(parsed.radius_km, MAX_RADIUS_KM)
              : DEFAULT_RADIUS_KM;
          radiusM = Math.round(km * 1000);
        } else {
          placeNotFound = true;
        }
      } catch (e) {
        console.warn(`[search] could not geocode "${place}":`, errorMessage(e));
        placeNotFound = true;
      }
    }

    // A facet the user picked in the UI wins over what the LLM guessed from the text.
    const filters: Record<string, string> = {};
    if (parsed.type && uiTypes.length === 0) filters.type = parsed.type;
    if (parsed.era && uiEras.length === 0) filters.era = parsed.era;

    if (!effectiveTopicEn && !effectiveTopicOriginal && !center && Object.keys(filters).length === 0) {
      return NextResponse.json({
        ok: true,
        query: rawQuery,
        parsed,
        usedFallback,
        interpreted_as: null,
        results: [],
        note: "Nothing to search on — try naming a place, a topic, or both.",
      });
    }

    // ── Primary search: English embedding + English FTS ───────────────────────
    const { data: dataEn, error: errorEn } = await db.rpc("search_sites", {
      query_embedding: queryEmbeddingEn,
      query_text: effectiveTopicEn || null,
      center,
      radius_m: radiusM,
      filters,
      match_count: MATCH_COUNT,
      filter_types: uiTypes.length > 0 ? uiTypes : null,
      filter_crafts: uiCrafts.length > 0 ? uiCrafts : null,
      filter_eras: uiEras.length > 0 ? uiEras : null,
    });
    if (errorEn) throw new Error(`Search failed: ${errorEn.message}`);

    const resultsEn = (dataEn ?? []) as SiteResultRow[];

    // ── Secondary search: original-script RPC (additive for non-English) ─────
    let mergedResults = resultsEn;

    if (isNonEnglish && (queryEmbeddingOrig || topicOriginal)) {
      try {
        const { data: dataOrig } = await db.rpc("search_sites_multilingual", {
          query_embedding: queryEmbeddingOrig,
          query_text_original: topicOriginal || null,
          center,
          radius_m: radiusM,
          filters,
          match_count: MATCH_COUNT,
          filter_types: uiTypes.length > 0 ? uiTypes : null,
          filter_crafts: uiCrafts.length > 0 ? uiCrafts : null,
          filter_eras: uiEras.length > 0 ? uiEras : null,
        });

        if (Array.isArray(dataOrig) && dataOrig.length > 0) {
          const seenIds = new Set(resultsEn.map((r) => r.site_id));
          const newRows = (dataOrig as SiteResultRow[]).filter(
            (r) => !seenIds.has(r.site_id),
          );
          if (newRows.length > 0) {
            mergedResults = [...resultsEn, ...newRows].sort(
              (a, b) => (b.score ?? 0) - (a.score ?? 0),
            );
          }
        }
      } catch (e) {
        // Non-fatal: original-script search is additive
        console.warn("[search] original-script secondary search failed:", errorMessage(e));
      }
    }

    const results = mergedResults.slice(0, MATCH_COUNT);

    // ── interpreted_as: what the engine understood ────────────────────────────
    const interpretedAs =
      isNonEnglish && topicEn && topicEn !== rawQuery
        ? {
            language: parsed.language,
            topic_en: topicEn,
            topic_original: topicOriginal || rawQuery,
          }
        : null;

    return NextResponse.json({
      ok: true,
      query: rawQuery,
      parsed,
      usedFallback,
      parseError: usedFallback ? parseError : undefined,
      interpreted_as: interpretedAs,
      place: place
        ? {
            requested: place,
            resolved: placeResolved,
            notFound: placeNotFound,
            radius_km: radiusM ? radiusM / 1000 : null,
          }
        : null,
      results,
      ...(results.length === 0
        ? {
            note: "No matching heritage records found. Try a broader area, a different topic, or fewer filters.",
          }
        : {}),
    });
  } catch (err) {
    console.error("[api/search]", err);
    return NextResponse.json(
      { ok: false, error: errorMessage(err) },
      { status: 500 },
    );
  }
}
