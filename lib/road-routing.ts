/**
 * Road Routing utility for the heritage atlas map.
 *
 * Goals:
 *  - Routes should follow major highways (NH / SH), NOT village lanes.
 *  - Routes should be visually clean for a heritage atlas — indicative of
 *    the corridor, not turn-by-turn navigation.
 *
 * Strategy:
 *  1. Ask OSRM for a simplified route geometry (overview=simplified).
 *  2. Apply Ramer-Douglas-Peucker simplification (epsilon ≈ 500 m) so that
 *     sharp kinks caused by entering village streets are smoothed away.
 *  3. Fall back to straight-line segments if OSRM is unreachable.
 */

const memoryCache = new Map<string, [number, number][]>();

function cacheKey(coords: [number, number][]): string {
  return coords.map(([lng, lat]) => `${lng.toFixed(4)},${lat.toFixed(4)}`).join(";");
}

function getFromSessionStorage(key: string): [number, number][] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`rr_${key.slice(0, 120)}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as [number, number][];
    }
  } catch { /* ignore */ }
  return null;
}

function saveToSessionStorage(key: string, coords: [number, number][]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`rr_${key.slice(0, 120)}`, JSON.stringify(coords));
  } catch { /* quota exceeded */ }
}

// ---------------------------------------------------------------------------
// Ramer-Douglas-Peucker simplification in geographic degrees.
// epsilon ≈ 0.005° ≈ 550 m — removes micro-zigzags through village streets
// while preserving major highway bends.
// ---------------------------------------------------------------------------
const SIMPLIFY_EPSILON = 0.005; // degrees

function perpendicularDistanceDeg(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) {
    return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  }
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  const tc = Math.max(0, Math.min(1, t));
  return Math.sqrt((px - (ax + tc * dx)) ** 2 + (py - (ay + tc * dy)) ** 2);
}

function rdpSimplify(
  pts: [number, number][],
  epsilon: number,
): [number, number][] {
  if (pts.length <= 2) return pts;

  let maxDist = 0;
  let maxIdx = 0;
  const last = pts.length - 1;

  for (let i = 1; i < last; i++) {
    const d = perpendicularDistanceDeg(pts[i], pts[0], pts[last]);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(pts.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(pts.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [pts[0], pts[last]];
}

/**
 * Fetches a clean, highway-level road route for an ordered list of [lng, lat]
 * waypoints using OSRM's public server.
 *
 * - Uses `overview=simplified` so OSRM returns a pre-smoothed geometry.
 * - Applies RDP simplification (≈500 m tolerance) to remove remaining
 *   village-street micro-zigzags.
 * - Always preserves the first and last waypoint exactly.
 * - Falls back to straight-line segments if offline or OSRM times out.
 */
export async function getRoadRouteGeometry(
  coordinates: [number, number][],
): Promise<[number, number][]> {
  if (!coordinates || coordinates.length < 2) return coordinates ?? [];

  const key = cacheKey(coordinates);

  // 1. In-memory cache
  if (memoryCache.has(key)) return memoryCache.get(key)!;

  // 2. sessionStorage cache
  const cached = getFromSessionStorage(key);
  if (cached) { memoryCache.set(key, cached); return cached; }

  // 3. OSRM request
  try {
    const coordStr = coordinates
      .map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
      .join(";");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const url =
      `https://router.project-osrm.org/route/v1/driving/${coordStr}` +
      `?overview=simplified&geometries=geojson&continue_straight=true`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const raw: [number, number][] | undefined =
        data?.code === "Ok" && data.routes?.[0]?.geometry?.coordinates;

      if (raw && raw.length >= 2) {
        // Apply RDP simplification to strip village-street kinks
        const simplified = rdpSimplify(raw, SIMPLIFY_EPSILON);

        // Always keep the original start/end waypoints so pins align with route ends
        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];
        const result: [number, number][] = [first, ...simplified.slice(1, -1), last];

        memoryCache.set(key, result);
        saveToSessionStorage(key, result);
        return result;
      }
    }
  } catch (err) {
    console.warn("[road-routing] OSRM unavailable, using straight-line fallback:", err);
  }

  // Fallback: straight-line segments
  return coordinates;
}
