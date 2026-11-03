// lib/road-routing.ts
// Snaps discrete journey waypoints onto actual road networks using OSRM (OpenStreetMap Routing)
// Free, public, no API key required, with local in-memory & browser storage caching.

export type LngLat = [number, number];

const routeCache = new Map<string, LngLat[]>();

function cacheKey(coords: LngLat[]): string {
  return coords
    .map(([lng, lat]) => `${lng.toFixed(4)},${lat.toFixed(4)}`)
    .join(";");
}

/**
 * Fetches actual driving road geometry for an array of [lng, lat] coordinates.
 * Returns a high-resolution array of [lng, lat] points following roads and highways.
 * Falls back to original straight-line coordinates if offline or if OSRM is unreachable.
 */
export async function getRoadRouteGeometry(
  coords: LngLat[],
  signal?: AbortSignal,
): Promise<LngLat[]> {
  if (!coords || coords.length < 2) return coords ?? [];

  const key = cacheKey(coords);

  // 1. Check in-memory cache
  if (routeCache.has(key)) {
    return routeCache.get(key)!;
  }

  // 2. Check browser sessionStorage
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      const stored = window.sessionStorage.getItem(`dh_route_${key}`);
      if (stored) {
        const parsed = JSON.parse(stored) as LngLat[];
        if (Array.isArray(parsed) && parsed.length >= coords.length) {
          routeCache.set(key, parsed);
          return parsed;
        }
      }
    } catch {
      // sessionStorage read failed, proceed to fetch
    }
  }

  // If there are many stops (> 15), break into pairwise legs to ensure OSRM reliability
  try {
    let resultCoords: LngLat[] = [];

    if (coords.length <= 15) {
      resultCoords = await fetchOsrmSingle(coords, signal);
    } else {
      // Pairwise chunking for very long circuits
      for (let i = 0; i < coords.length - 1; i++) {
        const leg = [coords[i], coords[i + 1]];
        const legRoad = await fetchOsrmSingle(leg, signal).catch(() => leg);
        if (resultCoords.length > 0) {
          // Avoid duplicate junction points
          resultCoords.push(...legRoad.slice(1));
        } else {
          resultCoords.push(...legRoad);
        }
      }
    }

    if (resultCoords && resultCoords.length >= 2) {
      routeCache.set(key, resultCoords);
      if (typeof window !== "undefined" && window.sessionStorage) {
        try {
          window.sessionStorage.setItem(
            `dh_route_${key}`,
            JSON.stringify(resultCoords),
          );
        } catch {
          // sessionStorage quota exceeded, ignore
        }
      }
      return resultCoords;
    }
  } catch (err) {
    console.warn("[road-routing] OSRM highway snap failed, using straight-line fallback:", err);
  }

  // Fallback to straight-line connection
  return coords;
}

/**
 * Single OSRM API call for up to 15 waypoints.
 */
async function fetchOsrmSingle(
  coords: LngLat[],
  externalSignal?: AbortSignal,
): Promise<LngLat[]> {
  const coordString = coords
    .map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`)
    .join(";");

  const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  // If external signal aborts, abort our controller
  if (externalSignal) {
    externalSignal.addEventListener("abort", () => controller.abort());
  }

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`OSRM responded with status ${res.status}`);
    }

    const data = await res.json();
    if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates) {
      return data.routes[0].geometry.coordinates as LngLat[];
    }

    throw new Error(data.message || "No road route returned by OSRM");
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}
