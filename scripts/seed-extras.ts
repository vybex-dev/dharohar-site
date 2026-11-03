#!/usr/bin/env -S npx tsx
/**
 * scripts/seed-extras.ts
 *
 * Idempotently seeds:
 * 1. Curated Hotspots (4-6 per pano) from seed/hotspots.json attached to pano assets.
 *    Each hotspot features: pitch, yaw, title, short English text, and optional site_slug link.
 * 2. Curated Published Journeys from seed/journeys.json referencing site slugs.
 *    Validates that all referenced slugs exist in the DB (fails loudly otherwise),
 *    computes haversine distance_km, and constructs the PostGIS LineString geometry.
 *
 * USAGE:
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/seed-extras.ts [flags]
 *
 * FLAGS:
 *   --hotspots=<path>   Path to hotspots JSON (default: seed/hotspots.json)
 *   --journeys=<path>   Path to journeys JSON (default: seed/journeys.json)
 *   --dry-run           Inspect inputs and validate DB matches without writing changes
 *   --help              Show this help message
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type HotspotItem = {
  id: string;
  pitch: number;
  yaw: number;
  title: string;
  text: string;
  category?: "architecture" | "folklore" | "inscription" | "history" | "general";
  site_slug?: string;
  site_name?: string;
};

type PanoHotspotsEntry = {
  site_slug?: string;
  filename?: string;
  asset_id?: string;
  title?: string;
  caption?: string;
  hotspots: HotspotItem[];
};

type JourneyEntry = {
  slug: string;
  title: string;
  description?: string;
  era?: string;
  tags?: string[];
  color?: string;
  site_slugs: string[];
};

type SiteRow = {
  id: string;
  slug: string;
  name_en: string;
  lat: number | null;
  lng: number | null;
};

type AssetRow = {
  id: string;
  site_id: string | null;
  kind: string;
  original_filename: string | null;
  storage_path: string | null;
  storage_bucket: string | null;
  title: string | null;
  caption: string | null;
  extracted: Record<string, unknown> | null;
};

/* -------------------------------------------------------------------------
 * Utility & Haversine Distance Calculation
 * ------------------------------------------------------------------------- */

function haversineDistanceKm(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let totalKm = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    const R = 6371; // Earth radius in km
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(deltaLambda / 2) *
        Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalKm += R * c;
  }
  return Math.round(totalKm * 10) / 10;
}

function getDbClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  // Realtime transport mock prevents Node 20 WebSocket check failure
  const realtimeTransport =
    typeof WebSocket !== "undefined" ? undefined : (class {} as unknown as typeof WebSocket);

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: realtimeTransport },
  });
}

/* -------------------------------------------------------------------------
 * Main Seeding Pipeline
 * ------------------------------------------------------------------------- */

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
Usage: npx tsx scripts/seed-extras.ts [options]

Options:
  --hotspots=<path>   Path to seed/hotspots.json
  --journeys=<path>   Path to seed/journeys.json
  --dry-run           Validate JSON files and database slugs without applying changes
  --help              Display help
`);
    process.exit(0);
  }

  const getArg = (prefix: string, fallback: string): string => {
    const found = argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length).trim() : fallback;
  };

  const dryRun = argv.includes("--dry-run");
  const hotspotsPath = resolve(getArg("--hotspots=", "seed/hotspots.json"));
  const journeysPath = resolve(getArg("--journeys=", "seed/journeys.json"));

  console.log("============================================================");
  console.log("🏛️  Dharohar: Seeding Curated Hotspots & Published Journeys");
  console.log("============================================================");
  if (dryRun) console.log("🔍 DRY RUN MODE: No database changes will be written.\n");

  const db = getDbClient();

  // 1. Fetch all sites with geo coordinates from sites_geo view
  const { data: sitesData, error: sitesErr } = await db
    .from("sites_geo")
    .select("id, slug, name_en, lat, lng");

  if (sitesErr || !sitesData) {
    throw new Error(`Failed to load sites from database: ${sitesErr?.message || "Unknown error"}`);
  }

  const siteBySlug = new Map<string, SiteRow>();
  const siteById = new Map<string, SiteRow>();
  for (const s of sitesData as SiteRow[]) {
    siteBySlug.set(s.slug, s);
    siteById.set(s.id, s);
  }

  console.log(`📍 Found ${siteBySlug.size} sites in database:`);
  for (const s of siteBySlug.values()) {
    console.log(`   - ${s.slug} ("${s.name_en}") [${s.lat ?? "no lat"}, ${s.lng ?? "no lng"}]`);
  }
  console.log("");

  // =========================================================================
  // Part 1: Seed Hotspots
  // =========================================================================
  console.log("------------------------------------------------------------");
  console.log("1️⃣  Processing Panorama Hotspots");
  console.log("------------------------------------------------------------");

  if (!existsSync(hotspotsPath)) {
    throw new Error(`Hotspots file not found at ${hotspotsPath}`);
  }

  const rawHotspots = readFileSync(hotspotsPath, "utf-8");
  const hotspotsData: PanoHotspotsEntry[] = JSON.parse(rawHotspots);

  if (!Array.isArray(hotspotsData) || hotspotsData.length === 0) {
    throw new Error(`Hotspots file ${hotspotsPath} must contain an array with at least 1 entry.`);
  }

  // Fetch all existing assets
  const { data: assetsData, error: assetsErr } = await db
    .from("assets")
    .select("id, site_id, kind, original_filename, storage_path, storage_bucket, title, caption, extracted");

  if (assetsErr) {
    throw new Error(`Failed to query assets: ${assetsErr.message}`);
  }
  const existingAssets = (assetsData ?? []) as AssetRow[];

  let totalHotspotsApplied = 0;
  let totalPanosConfigured = 0;

  for (let idx = 0; idx < hotspotsData.length; idx++) {
    const entry = hotspotsData[idx];
    const entryLabel = entry.site_slug || entry.filename || entry.asset_id || `entry #${idx + 1}`;

    // Validate hotspot count (4-6 recommended)
    if (!Array.isArray(entry.hotspots) || entry.hotspots.length < 4 || entry.hotspots.length > 6) {
      console.warn(
        `⚠️  Warning: ${entryLabel} has ${entry.hotspots?.length ?? 0} hotspots (recommended: 4-6).`
      );
    }

    // Validate and enrich each hotspot
    for (const h of entry.hotspots) {
      if (!h.id || typeof h.pitch !== "number" || typeof h.yaw !== "number") {
        throw new Error(
          `Invalid hotspot in ${entryLabel}: id, pitch (number), and yaw (number) are required.`
        );
      }
      if (!h.title || !h.text) {
        throw new Error(`Hotspot "${h.id}" in ${entryLabel} must have non-empty title and text.`);
      }
      if (h.site_slug) {
        const linkedSite = siteBySlug.get(h.site_slug);
        if (!linkedSite) {
          throw new Error(
            `Hotspot "${h.id}" references site_slug "${h.site_slug}" which does not exist in the database!\n` +
              `Existing site slugs are: ${Array.from(siteBySlug.keys()).join(", ")}`
          );
        }
        h.site_name = linkedSite.name_en;
      }
    }

    // Find target asset
    let targetAsset: AssetRow | undefined;
    if (entry.asset_id) {
      targetAsset = existingAssets.find((a) => a.id === entry.asset_id);
    }
    if (!targetAsset && entry.filename) {
      targetAsset = existingAssets.find(
        (a) =>
          a.original_filename === entry.filename ||
          a.storage_path?.endsWith(`/${entry.filename}`)
      );
    }
    if (!targetAsset && entry.site_slug) {
      const site = siteBySlug.get(entry.site_slug);
      if (site) {
        targetAsset = existingAssets.find(
          (a) => a.site_id === site.id && a.kind === "pano"
        );
      }
    }

    const targetSite = entry.site_slug ? siteBySlug.get(entry.site_slug) : null;

    if (!dryRun) {
      if (targetAsset) {
        // Update existing asset
        const updatedExtracted = {
          ...(targetAsset.extracted || {}),
          hotspots: entry.hotspots,
        };
        const updatePayload: Record<string, unknown> = {
          extracted: updatedExtracted,
          kind: "pano",
        };
        if (entry.title) updatePayload.title = entry.title;
        if (entry.caption) updatePayload.caption = entry.caption;
        if (targetSite && !targetAsset.site_id) updatePayload.site_id = targetSite.id;

        const { error: upErr } = await db
          .from("assets")
          .update(updatePayload)
          .eq("id", targetAsset.id);

        if (upErr) {
          throw new Error(`Failed to update asset ${targetAsset.id}: ${upErr.message}`);
        }
        console.log(
          `✅ Updated asset ${targetAsset.id} (${targetAsset.original_filename || "pano"}) with ${entry.hotspots.length} hotspots.`
        );
      } else if (targetSite) {
        // Create new pano asset row attached to the site
        const bucket = process.env.SUPABASE_STORAGE_BUCKET || "heritage-uploads";
        const filename = entry.filename || `${targetSite.slug}-360.jpg`;
        const storagePath = `panos/${filename}`;

        const { data: newAsset, error: insErr } = await db
          .from("assets")
          .insert({
            site_id: targetSite.id,
            kind: "pano",
            storage_bucket: bucket,
            storage_path: storagePath,
            original_filename: filename,
            mime_type: "image/jpeg",
            title: entry.title || `${targetSite.name_en} 360° Panorama`,
            caption: entry.caption || `Interactive equirectangular panorama of ${targetSite.name_en}`,
            extracted: { hotspots: entry.hotspots },
          })
          .select("id")
          .single();

        if (insErr || !newAsset) {
          throw new Error(`Failed to create pano asset for site ${targetSite.slug}: ${insErr?.message}`);
        }
        console.log(
          `✅ Created new pano asset ${newAsset.id} for "${targetSite.name_en}" with ${entry.hotspots.length} hotspots.`
        );
      } else {
        throw new Error(
          `Cannot assign hotspots for entry #${idx + 1}: neither matching asset nor valid site_slug found.`
        );
      }
    } else {
      console.log(
        `[DRY RUN] Would assign ${entry.hotspots.length} hotspots to pano for ${targetSite?.name_en || entryLabel}.`
      );
    }

    totalHotspotsApplied += entry.hotspots.length;
    totalPanosConfigured++;
  }

  console.log(`\n🎉 Hotspots complete: ${totalHotspotsApplied} hotspots across ${totalPanosConfigured} panoramas.`);

  // =========================================================================
  // Part 2: Seed Published Journeys
  // =========================================================================
  console.log("\n------------------------------------------------------------");
  console.log("2️⃣  Processing Published Journeys (4+ required)");
  console.log("------------------------------------------------------------");

  if (!existsSync(journeysPath)) {
    throw new Error(`Journeys file not found at ${journeysPath}`);
  }

  const rawJourneys = readFileSync(journeysPath, "utf-8");
  const journeysData: JourneyEntry[] = JSON.parse(rawJourneys);

  if (!Array.isArray(journeysData) || journeysData.length < 4) {
    throw new Error(
      `Journeys file ${journeysPath} must contain at least 4 journeys (found ${journeysData?.length ?? 0}).`
    );
  }

  let journeysCreated = 0;

  for (const j of journeysData) {
    // 1. Slug format validation
    if (!j.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(j.slug)) {
      throw new Error(`Journey has invalid slug: "${j.slug}". Must be lowercase alphanumeric with hyphens.`);
    }

    if (!j.title?.trim()) {
      throw new Error(`Journey "${j.slug}" must have a non-empty title.`);
    }

    if (!Array.isArray(j.site_slugs) || j.site_slugs.length < 2) {
      throw new Error(
        `Journey "${j.slug}" must have at least 2 site_slugs to form a route line (found ${j.site_slugs?.length ?? 0}).`
      );
    }

    // 2. Validate every site slug exists in DB - FAIL LOUDLY otherwise
    const orderedSiteIds: string[] = [];
    const orderedCoords: [number, number][] = [];

    for (const slug of j.site_slugs) {
      const site = siteBySlug.get(slug);
      if (!site) {
        throw new Error(
          `\n🚨 VALIDATION ERROR: Site slug "${slug}" in journey "${j.slug}" does not exist in the database!\n` +
            `Available site slugs are:\n` +
            Array.from(siteBySlug.keys())
              .map((s) => `  - ${s}`)
              .join("\n") +
            `\nPlease correct seed/journeys.json and re-run.`
        );
      }

      if (site.lat === null || site.lng === null) {
        throw new Error(
          `Site "${slug}" (${site.name_en}) has null coordinates. Cannot generate journey LineString route.`
        );
      }

      orderedSiteIds.push(site.id);
      orderedCoords.push([site.lng, site.lat]); // [lng, lat] for GeoJSON & PostGIS
    }

    // 3. Compute distance in km using Haversine formula
    const distanceKm = haversineDistanceKm(orderedCoords);

    // 4. Construct PostGIS LineString EWKT: SRID=4326;LINESTRING(lng lat, lng lat, ...)
    const lineCoordStrings = orderedCoords.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
    const ewkt = `SRID=4326;LINESTRING(${lineCoordStrings})`;

    const color = j.color && /^#[0-9a-fA-F]{6}$/.test(j.color) ? j.color : "#b45309";
    const tags = Array.isArray(j.tags) ? j.tags : [];

    console.log(`\n🛤️  Journey: "${j.title}" (${j.slug})`);
    console.log(`   - Stops (${orderedSiteIds.length}): ${j.site_slugs.join(" ➔ ")}`);
    console.log(`   - Distance: ${distanceKm} km | Era: ${j.era || "Heritage"} | Color: ${color}`);

    if (!dryRun) {
      // Upsert journey
      const { data: savedJourney, error: jErr } = await db
        .from("journeys")
        .upsert(
          {
            slug: j.slug,
            title: j.title,
            title_en: j.title,
            description: j.description ?? null,
            description_en: j.description ?? null,
            era: j.era ?? null,
            tags,
            color,
            route: ewkt,
            site_ids: orderedSiteIds,
            distance_km: distanceKm,
            status: "published",
          },
          { onConflict: "slug" }
        )
        .select("id, slug, title")
        .single();

      if (jErr || !savedJourney) {
        throw new Error(`Failed to upsert journey "${j.slug}": ${jErr?.message}`);
      }

      // Also sync journey_stops table if it exists
      const { error: delStopsErr } = await db
        .from("journey_stops")
        .delete()
        .eq("journey_id", savedJourney.id);

      if (!delStopsErr) {
        const stopsToInsert = orderedSiteIds.map((siteId, idx) => ({
          journey_id: savedJourney.id,
          site_id: siteId,
          position: idx + 1,
        }));
        await db.from("journey_stops").insert(stopsToInsert);
      }

      journeysCreated++;
      console.log(`   ✅ Saved & published in database (id: ${savedJourney.id}).`);
    } else {
      console.log(`   [DRY RUN] Would upsert journey with ${orderedSiteIds.length} stops (${distanceKm} km).`);
      journeysCreated++;
    }
  }

  console.log("\n============================================================");
  console.log(`✨ DONE: Successfully processed ${journeysCreated} published journeys and ${totalPanosConfigured} panoramas!`);
  console.log("============================================================");
}

main().catch((err) => {
  console.error("\n❌ Fatal Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
