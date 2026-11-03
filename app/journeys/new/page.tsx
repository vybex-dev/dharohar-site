"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { buildStyle, workerUrl } from "@/lib/map-style";
import type { SiteDto } from "@/lib/facets";
import type { GeneratedJourneyResponse, GeneratedStop } from "@/app/api/journeys/generate/route";

type MapLibre = typeof import("maplibre-gl");
type LngLat = [number, number];

const COLOR_OPTIONS = [
  { label: "Amber Gold", hex: "#b45309" },
  { label: "Emerald Green", hex: "#047857" },
  { label: "Indigo Royal", hex: "#4338ca" },
  { label: "Crimson Rose", hex: "#be123c" },
  { label: "Desert Teal", hex: "#0f766e" },
  { label: "Ochre Earth", hex: "#c2410c" },
];

const SUGGESTED_PROMPTS = [
  "3 days of Solanki stepwells from Ahmedabad",
  "2 days of desert craft & textiles in Kutch",
  "Weekend of forts & stepwells around Patan",
  "Temples and stepwells near Mehsana",
];

function calculateDistanceKm(points: LngLat[]): number {
  if (points.length < 2) return 0;
  let totalMeters = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [lon1, lat1] = points[i];
    const [lon2, lat2] = points[i + 1];
    const R = 6371e3; // Earth radius in meters
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
    totalMeters += R * c;
  }
  return Math.round((totalMeters / 1000) * 10) / 10;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function NewJourneyPage() {
  const router = useRouter();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<MapLibre | null>(null);
  const waypointsMarkersRef = useRef<Marker[]>([]);
  const planMarkersRef = useRef<Marker[]>([]);

  // AI Trip Planner states
  const [plannerPrompt, setPlannerPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedJourneyResponse | null>(null);
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [savingGenerated, setSavingGenerated] = useState(false);
  const [showManualBuilder, setShowManualBuilder] = useState(false);

  // Manual form states
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [era, setEra] = useState("");
  const [description, setDescription] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [color, setColor] = useState("#b45309");

  // Route drawing states
  const [waypoints, setWaypoints] = useState<LngLat[]>([]);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [allSites, setAllSites] = useState<SiteDto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Derive slug from title lazily
  const derivedSlug = useMemo(() => slugify(title), [title]);
  useEffect(() => {
    if (!slugTouched) {
      queueMicrotask(() => setSlug(derivedSlug));
    }
  }, [derivedSlug, slugTouched]);

  // Load existing heritage sites
  useEffect(() => {
    fetch("/api/sites")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.sites)) {
          setAllSites(data.sites);
        }
      })
      .catch(() => {});
  }, []);

  // Initialize MapLibre
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const lib = await import("maplibre-gl");
      if (cancelled || !mapContainerRef.current) return;
      libRef.current = lib;
      lib.setWorkerUrl(workerUrl());

      const map = new lib.Map({
        container: mapContainerRef.current,
        style: buildStyle(),
        center: [72.5714, 23.0225], // Gujarat center
        zoom: 7,
      });

      map.addControl(new lib.NavigationControl(), "top-right");

      map.on("load", () => {
        if (cancelled) return;
        mapRef.current = map;
        setMapLoaded(true);

        // Add line source & layer for the journey route
        map.addSource("journey-draw-route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [],
            },
          },
        });

        // Translucent casing
        map.addLayer({
          id: "journey-draw-casing",
          type: "line",
          source: "journey-draw-route",
          paint: {
            "line-color": "#b45309",
            "line-width": 8,
            "line-opacity": 0.35,
          },
        });

        // Solid route line
        map.addLayer({
          id: "journey-draw-line",
          type: "line",
          source: "journey-draw-route",
          paint: {
            "line-color": "#b45309",
            "line-width": 4,
            "line-opacity": 0.95,
          },
        });

        // Click map to append manual waypoint (only if not viewing an AI plan)
        map.on("click", (e) => {
          const lngLat: LngLat = [
            Math.round(e.lngLat.lng * 10000) / 10000,
            Math.round(e.lngLat.lat * 10000) / 10000,
          ];
          setWaypoints((prev) => [...prev, lngLat]);
        });
      });
    }

    init();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
    };
  }, []);

  // Update route line on map for manual waypoints when generatedPlan is null
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || generatedPlan) return;

    const source = map.getSource("journey-draw-route") as
      | { setData: (data: GeoJSON.Feature) => void }
      | undefined;

    if (source) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: waypoints,
        },
      });
    }

    // Update layer colors
    if (map.getLayer("journey-draw-casing")) {
      map.setPaintProperty("journey-draw-casing", "line-color", color);
    }
    if (map.getLayer("journey-draw-line")) {
      map.setPaintProperty("journey-draw-line", "line-color", color);
    }

    // Clear old waypoint markers
    for (const m of waypointsMarkersRef.current) m.remove();
    waypointsMarkersRef.current = [];

    // Add numbered pin for each manual waypoint
    const lib = libRef.current;
    if (!lib) return;

    waypoints.forEach(([lng, lat], idx) => {
      const el = document.createElement("div");
      el.className =
        "flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-md transition transform hover:scale-110";
      el.style.backgroundColor = color;
      el.textContent = String(idx + 1);

      const marker = new lib.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);

      waypointsMarkersRef.current.push(marker);
    });
  }, [waypoints, color, mapLoaded, generatedPlan]);

  // Update map when generatedPlan changes
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !mapLoaded || !lib) return;

    // Clear plan markers
    for (const m of planMarkersRef.current) m.remove();
    planMarkersRef.current = [];

    if (!generatedPlan || generatedPlan.days.length === 0) return;

    // Set route LineString
    const source = map.getSource("journey-draw-route") as
      | { setData: (data: GeoJSON.Feature) => void }
      | undefined;

    if (source) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: generatedPlan.route_geojson,
      });
    }

    if (map.getLayer("journey-draw-casing")) {
      map.setPaintProperty("journey-draw-casing", "line-color", color);
    }
    if (map.getLayer("journey-draw-line")) {
      map.setPaintProperty("journey-draw-line", "line-color", color);
    }

    const bounds = new lib.LngLatBounds();

    // Add origin marker if present
    if (generatedPlan.origin) {
      const { lng, lat, name } = generatedPlan.origin;
      bounds.extend([lng, lat]);

      const originEl = document.createElement("div");
      originEl.className =
        "flex items-center gap-1 rounded-full bg-stone-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg ring-2 ring-white/80";
      originEl.innerHTML = `<span>🚩</span><span>${name || "Origin"}</span>`;

      const originMarker = new lib.Marker({ element: originEl })
        .setLngLat([lng, lat])
        .addTo(map);
      planMarkersRef.current.push(originMarker);
    }

    // Add numbered markers for each stop
    let stopCounter = 1;
    generatedPlan.days.forEach((day) => {
      day.stops.forEach((stop) => {
        bounds.extend([stop.lng, stop.lat]);

        const el = document.createElement("button");
        el.type = "button";
        el.className =
          "group flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-lg transition-transform hover:scale-125 focus:outline-none";
        el.style.backgroundColor = color;
        el.textContent = String(stopCounter++);
        el.title = `${stop.name} (Day ${day.day})`;

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          setActiveStopId(stop.site_id);
          map.flyTo({
            center: [stop.lng, stop.lat],
            zoom: 13,
            speed: 1.2,
            essential: true,
          });
        });

        const marker = new lib.Marker({ element: el })
          .setLngLat([stop.lng, stop.lat])
          .addTo(map);

        planMarkersRef.current.push(marker);
      });
    });

    // Fit map bounds to show complete journey route
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 12 });
    }
  }, [generatedPlan, color, mapLoaded]);

  // Display existing background sites on map
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib || !mapLoaded || allSites.length === 0) return;

    const markers: Marker[] = [];
    for (const site of allSites) {
      const el = document.createElement("div");
      el.className =
        "cursor-pointer rounded-md bg-stone-900/80 px-2 py-0.5 text-[10px] font-medium text-amber-200 shadow ring-1 ring-white/30 backdrop-blur-sm hover:bg-amber-800 hover:text-white";
      el.textContent = `📍 ${site.name_en}`;
      el.title = `Click to add ${site.name_en} to this journey`;

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const pt: LngLat = [site.lng, site.lat];
        setWaypoints((prev) => [...prev, pt]);
        setSelectedSiteIds((prev) =>
          prev.includes(site.id) ? prev : [...prev, site.id],
        );
        setShowManualBuilder(true);
      });

      const m = new lib.Marker({ element: el })
        .setLngLat([site.lng, site.lat])
        .addTo(map);
      markers.push(m);
    }

    return () => {
      for (const m of markers) m.remove();
    };
  }, [allSites, mapLoaded]);

  // Handle Generate Itinerary API call
  const handleGenerate = async (e?: React.FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const query = (customPrompt ?? plannerPrompt).trim();
    if (!query) return;

    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedPlan(null);
    setActiveStopId(null);

    try {
      const res = await fetch("/api/journeys/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: query }),
      });

      const data: GeneratedJourneyResponse = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || (data as unknown as { error?: string }).error || "Failed to generate journey");
      }

      setGeneratedPlan(data);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  // Fly to stop from card click
  const handleFlyToStop = (stop: GeneratedStop) => {
    setActiveStopId(stop.site_id);
    mapRef.current?.flyTo({
      center: [stop.lng, stop.lat],
      zoom: 13,
      speed: 1.2,
      essential: true,
    });
  };

  // Save the AI generated journey to the database
  const handleSaveGeneratedJourney = async () => {
    if (!generatedPlan || generatedPlan.days.length === 0) return;

    setSavingGenerated(true);
    setError(null);

    try {
      const siteIds = generatedPlan.days.flatMap((d) => d.stops.map((s) => s.site_id));
      const autoSlug = `${slugify(generatedPlan.title)}-${Math.floor(Math.random() * 899 + 100)}`;
      const tags = [
        generatedPlan.parsed?.category,
        generatedPlan.parsed?.theme,
        "ai-planned",
      ].filter(Boolean) as string[];

      const res = await fetch("/api/journeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: generatedPlan.title,
          slug: autoSlug,
          era: generatedPlan.parsed?.era || undefined,
          description: generatedPlan.intro,
          tags,
          color,
          coordinates: generatedPlan.route_geojson.coordinates,
          siteIds,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to save journey");
      }

      router.push(`/?journey=${data.journey.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingGenerated(false);
    }
  };

  // Load generated plan into manual builder for customization
  const handleCustomizeInManualBuilder = () => {
    if (!generatedPlan) return;
    setTitle(generatedPlan.title);
    setSlug(slugify(generatedPlan.title));
    setDescription(generatedPlan.intro);
    setEra(generatedPlan.parsed?.era || "");
    setTagsStr(
      [generatedPlan.parsed?.category, generatedPlan.parsed?.theme]
        .filter(Boolean)
        .join(", "),
    );
    setWaypoints(generatedPlan.route_geojson.coordinates);
    setSelectedSiteIds(generatedPlan.days.flatMap((d) => d.stops.map((s) => s.site_id)));
    setGeneratedPlan(null);
    setShowManualBuilder(true);
  };

  const undoLastPoint = () => {
    setWaypoints((prev) => prev.slice(0, -1));
  };

  const clearRoute = () => {
    setWaypoints([]);
    setSelectedSiteIds([]);
    setGeneratedPlan(null);
  };

  const reverseRoute = () => {
    setWaypoints((prev) => [...prev].reverse());
    setSelectedSiteIds((prev) => [...prev].reverse());
  };

  const manualDistanceKm = calculateDistanceKm(waypoints);

  // Manual journey submission
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (waypoints.length < 2) {
      setError("Please click on the map to add at least 2 points for the journey route.");
      return;
    }

    if (!title.trim() || !slug.trim()) {
      setError("Title and slug are required.");
      return;
    }

    setSubmitting(true);
    try {
      const tags = tagsStr
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/journeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          era: era.trim() || undefined,
          description: description.trim() || undefined,
          tags,
          color,
          coordinates: waypoints,
          siteIds: selectedSiteIds,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Failed to save journey (HTTP ${res.status})`);
      }

      router.push(`/?journey=${data.journey.slug}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-stone-50 text-stone-900 md:flex-row">
      {/* Left/Sidebar Form & Itinerary */}
      <div className="flex flex-col border-b border-stone-200 bg-white shadow-lg md:h-full md:w-[480px] md:border-b-0 md:border-r">
        {/* Header */}
        <div className="border-b border-stone-200 px-6 py-4">
          <nav aria-label="Breadcrumb" className="mb-1 text-xs">
            <Link
              href="/"
              className="font-medium text-amber-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-amber-700"
            >
              ← Back to Atlas
            </Link>
          </nav>
          <div className="flex items-center justify-between">
            <h1 className="font-serif text-2xl font-bold tracking-tight text-stone-900">
              Plan a Journey
            </h1>
            <div className="flex items-center gap-1">
              {COLOR_OPTIONS.slice(0, 3).map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setColor(c.hex)}
                  title={c.label}
                  aria-label={c.label}
                  className={`h-4 w-4 rounded-full border transition ${
                    color === c.hex ? "scale-110 ring-2 ring-stone-900" : "border-stone-300"
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-stone-600">
            Describe a trip in plain text to get an ordered, mapped itinerary built
            strictly from verified heritage sites.
          </p>
        </div>

        {/* Scrollable Main Column */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            >
              {error}
            </div>
          )}

          {/* AI Trip Planner Box: "Describe your trip" */}
          <section className="rounded-xl border border-amber-200/80 bg-gradient-to-b from-amber-50/60 to-stone-50/50 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-800 text-[11px] text-white">
                ✦
              </span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-950">
                Describe your trip
              </h2>
            </div>

            <form onSubmit={(e) => handleGenerate(e)} className="mt-2.5 space-y-3">
              <div className="relative">
                <textarea
                  rows={2}
                  value={plannerPrompt}
                  onChange={(e) => setPlannerPrompt(e.target.value)}
                  placeholder="e.g. 3 days of Solanki stepwells from Ahmedabad"
                  disabled={isGenerating}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-700 disabled:opacity-60"
                />
              </div>

              {/* Suggested Prompt Chips */}
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPlannerPrompt(p);
                      handleGenerate(undefined, p);
                    }}
                    disabled={isGenerating}
                    className="rounded-md border border-amber-300/60 bg-amber-100/50 px-2 py-0.5 text-[11px] text-amber-900 transition hover:bg-amber-200/70 disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-stone-500">
                  Queries our database and clusters stops deterministically
                </span>
                <button
                  type="submit"
                  disabled={isGenerating || plannerPrompt.trim().length < 3}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-800 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-amber-900 focus-visible:outline-2 focus-visible:outline-amber-800 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <svg
                        className="h-3.5 w-3.5 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                      Planning...
                    </>
                  ) : (
                    <>
                      <span>Plan Itinerary</span>
                      <span>→</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>

          {/* Loading Skeleton */}
          {isGenerating && (
            <div className="animate-pulse space-y-4 rounded-xl border border-stone-200 bg-white p-4">
              <div className="h-6 w-3/4 rounded bg-stone-200" />
              <div className="h-4 w-full rounded bg-stone-100" />
              <div className="h-4 w-5/6 rounded bg-stone-100" />
              <div className="mt-4 space-y-3">
                <div className="h-4 w-1/4 rounded bg-stone-200" />
                <div className="h-16 rounded-lg bg-stone-100" />
                <div className="h-16 rounded-lg bg-stone-100" />
              </div>
            </div>
          )}

          {/* Generation Error State */}
          {generationError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900"
            >
              <div className="font-semibold text-red-800">Could not generate itinerary</div>
              <p className="mt-1 leading-relaxed text-red-700">{generationError}</p>
              <button
                type="button"
                onClick={() => handleGenerate()}
                className="mt-3 rounded-md bg-red-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-900"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Empty State */}
          {generatedPlan?.empty && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
              <div className="flex items-center gap-2 font-semibold">
                <span>🔍</span>
                <span>No matching sites yet, try a broader theme</span>
              </div>
              <p className="mt-1 leading-relaxed text-amber-800">
                We couldn&apos;t find published records matching this query within
                the target area. Try broader keywords like &quot;stepwells&quot;, &quot;forts&quot;,
                or &quot;Gujarat crafts&quot;.
              </p>
            </div>
          )}

          {/* Generated Itinerary Result Display */}
          {generatedPlan && !generatedPlan.empty && generatedPlan.days.length > 0 && (
            <div className="space-y-4">
              {/* Itinerary Header & Overview */}
              <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-serif text-lg font-bold text-stone-900">
                    {generatedPlan.title}
                  </h2>
                  {generatedPlan.flagged && (
                    <span className="shrink-0 rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-700">
                      Standard blurbs
                    </span>
                  )}
                </div>

                <p className="mt-1 text-xs leading-relaxed text-stone-700">
                  {generatedPlan.intro}
                </p>

                {/* Distance & Routing Stats */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3 text-xs">
                  <span className="font-bold text-amber-900">
                    {generatedPlan.total_km} km total
                  </span>
                  <span className="text-stone-300">•</span>
                  <span className="text-stone-600">
                    {generatedPlan.days.reduce((acc, d) => acc + d.stops.length, 0)} stops
                  </span>
                  <span className="text-stone-300">•</span>
                  <span className="inline-flex items-center gap-1 rounded bg-stone-200/80 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">
                    Approximate straight-line route
                  </span>
                </div>

                {/* Save Journey Primary Actions */}
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveGeneratedJourney}
                    disabled={savingGenerated}
                    className="flex-1 rounded-lg bg-amber-800 py-2.5 text-xs font-semibold text-white shadow transition hover:bg-amber-900 disabled:opacity-50"
                  >
                    {savingGenerated ? "Saving Journey..." : "Save Journey to Atlas"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCustomizeInManualBuilder}
                    className="rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-xs font-medium text-stone-700 shadow-sm hover:bg-stone-50"
                  >
                    Edit Route
                  </button>
                </div>
              </div>

              {/* Day-by-Day Stops Card List */}
              <div className="space-y-3">
                {generatedPlan.days.map((day) => (
                  <div
                    key={day.day}
                    className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm"
                  >
                    <div className="mb-2 flex items-center justify-between border-b border-stone-100 pb-2">
                      <span className="font-serif text-sm font-bold text-stone-900">
                        Day {day.day}
                      </span>
                      <span className="text-[11px] font-medium text-stone-500">
                        {day.stops.length} {day.stops.length === 1 ? "stop" : "stops"}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {day.stops.map((stop) => {
                        const isSelected = activeStopId === stop.site_id;
                        return (
                          <div
                            key={stop.site_id}
                            onClick={() => handleFlyToStop(stop)}
                            className={`cursor-pointer rounded-lg border p-2.5 transition ${
                              isSelected
                                ? "border-amber-600 bg-amber-50/70 shadow-sm ring-1 ring-amber-600"
                                : "border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                  style={{ backgroundColor: color }}
                                >
                                  📍
                                </span>
                                <h3 className="text-xs font-bold text-stone-900">
                                  {stop.name}
                                </h3>
                              </div>
                              <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] capitalize text-stone-600">
                                {stop.category}
                              </span>
                            </div>

                            <p className="mt-1.5 text-xs text-stone-700">
                              {stop.blurb}
                            </p>

                            <div className="mt-2 flex items-center justify-between text-[10px] text-stone-500">
                              <span>
                                {[stop.district, stop.state].filter(Boolean).join(", ")}
                              </span>
                              <span className="font-semibold text-stone-700">
                                ~{stop.leg_km} km leg
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toggle Manual Builder */}
          <div className="border-t border-stone-200 pt-3">
            <button
              type="button"
              onClick={() => setShowManualBuilder(!showManualBuilder)}
              className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
            >
              <span>Manual Route Builder (Draw on Map)</span>
              <span>{showManualBuilder ? "▲" : "▼"}</span>
            </button>
          </div>

          {/* Manual Builder Form */}
          {showManualBuilder && (
            <form onSubmit={handleManualSubmit} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700">
                  Journey Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Solanki Stepwell & Temple Corridor"
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700">
                    Slug (URL key) *
                  </label>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(e.target.value);
                    }}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700">
                    Historical Era
                  </label>
                  <input
                    type="text"
                    value={era}
                    onChange={(e) => setEra(e.target.value)}
                    placeholder="e.g. 11th-13th century"
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700">
                  Route Theme Color
                </label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setColor(c.hex)}
                      aria-label={c.label}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        color === c.hex
                          ? "border-stone-900 bg-stone-900 text-white shadow"
                          : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
                      }`}
                    >
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: c.hex }}
                      />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700">
                  Description &amp; Narrative
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell the story of this travel route, dynasty history, or architectural connection..."
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  placeholder="stepwell, unesco, solanki, pilgrim-route"
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>

              {/* Waypoints & Distance Summary */}
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                    Waypoints Plotted: {waypoints.length}
                  </span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                    {manualDistanceKm} km total
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={undoLastPoint}
                    disabled={waypoints.length === 0}
                    className="flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-40"
                  >
                    ↺ Undo Last
                  </button>
                  <button
                    type="button"
                    onClick={reverseRoute}
                    disabled={waypoints.length < 2}
                    className="flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-40"
                  >
                    ⇄ Reverse
                  </button>
                  <button
                    type="button"
                    onClick={clearRoute}
                    disabled={waypoints.length === 0}
                    className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>

                {waypoints.length > 0 && (
                  <ol className="mt-3 max-h-36 space-y-1 overflow-y-auto text-xs text-stone-600">
                    {waypoints.map(([lng, lat], i) => (
                      <li key={`${lng}-${lat}-${i}`} className="flex items-center gap-2">
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                          style={{ backgroundColor: color }}
                        >
                          {i + 1}
                        </span>
                        <span>
                          {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || waypoints.length < 2}
                className="w-full rounded-lg bg-amber-800 py-3 text-sm font-semibold text-white shadow transition hover:bg-amber-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800 disabled:opacity-50"
              >
                {submitting ? "Publishing Journey..." : "Publish Journey Route"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Right Map Canvas */}
      <div className="relative flex-1">
        <div ref={mapContainerRef} className="h-full w-full min-h-[400px]" />

        {/* Floating Drawing Helper Hint */}
        <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-sm rounded-lg bg-stone-900/85 p-3 text-xs text-white shadow-xl backdrop-blur-md">
          <p className="font-semibold text-amber-400">
            {generatedPlan ? "Itinerary mapped" : "Journey Route Planner"}
          </p>
          <p className="mt-1 leading-relaxed text-stone-200">
            {generatedPlan
              ? "Tap any stop card on the left to fly to its position. Route lines depict straight-line connections between stops."
              : "Use 'Describe your trip' on the left to generate an AI itinerary, or click on the map to draw your own custom route."}
          </p>
        </div>
      </div>
    </div>
  );
}
