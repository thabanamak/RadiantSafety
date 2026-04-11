/**
 * Street-snap pipeline: takes a raw A* coordinate array and snaps it to
 * the real walking network via the Mapbox Directions API.
 *
 * Usage:
 *   const snapped = await snapRouteToStreets(rawAStarCoords);
 *   if (snapped) setSafeRouteData(snapped);
 *   // else fall back to raw coords already displayed
 */

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

// ─── Douglas-Peucker simplification ────────────────────────────────────────

/** Squared perpendicular distance from point `p` to segment `[a, b]`. */
function perpDistSq(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const qx = a[0] + t * dx - p[0];
  const qy = a[1] + t * dy - p[1];
  return qx * qx + qy * qy;
}

function rdpMark(
  pts: [number, number][],
  epsSq: number,
  lo: number,
  hi: number,
  keep: boolean[],
): void {
  if (hi <= lo + 1) return;
  let maxD = 0;
  let maxI = lo;
  for (let i = lo + 1; i < hi; i++) {
    const d = perpDistSq(pts[i], pts[lo], pts[hi]);
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD > epsSq) {
    keep[maxI] = true;
    rdpMark(pts, epsSq, lo, maxI, keep);
    rdpMark(pts, epsSq, maxI, hi, keep);
  }
}

function rdp(pts: [number, number][], epsilon: number): [number, number][] {
  if (pts.length <= 2) return pts;
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  rdpMark(pts, epsilon * epsilon, 0, pts.length - 1, keep);
  return pts.filter((_, i) => keep[i]);
}

// ─── Public helpers ─────────────────────────────────────────────────────────

/**
 * Reduce a coordinate array to at most `maxPoints` key waypoints using
 * Douglas-Peucker (with a uniform-subsample fallback).
 *
 * Coordinates are `[lng, lat]` in decimal degrees.
 */
export function simplifyWaypoints(
  coords: [number, number][],
  maxPoints = 25,
): [number, number][] {
  if (coords.length <= maxPoints) return coords;

  // Grow epsilon until the simplified path fits within maxPoints.
  let epsilon = 1e-5;
  for (let i = 0; i < 50; i++) {
    const simplified = rdp(coords, epsilon);
    if (simplified.length <= maxPoints) return simplified;
    epsilon *= 1.5;
  }

  // Uniform-subsample fallback (should rarely be needed).
  const step = Math.ceil((coords.length - 1) / (maxPoints - 1));
  const result: [number, number][] = [];
  for (let i = 0; i < coords.length - 1; i += step) result.push(coords[i]);
  result.push(coords[coords.length - 1]);
  return result;
}

/**
 * Snap a raw A* path to the real walking network via the Mapbox Directions API.
 *
 * - Simplifies the path to ≤ 25 waypoints (Mapbox limit).
 * - Returns the street-following GeoJSON coordinate array on success.
 * - Returns `null` on any failure so callers can fall back gracefully.
 */
export async function snapRouteToStreets(
  rawCoords: [number, number][],
): Promise<[number, number][] | null> {
  if (!MAPBOX_TOKEN || rawCoords.length < 2) return null;

  const waypoints = simplifyWaypoints(rawCoords, 25);
  const coordStr = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/walking/${coordStr}` +
    `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

  try {
    const signal =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(15_000)
        : undefined;

    const res = await fetch(url, { signal });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      routes?: Array<{ geometry: { coordinates: [number, number][] } }>;
    };
    if (!data.routes?.length) return null;

    return data.routes[0].geometry.coordinates;
  } catch {
    return null;
  }
}
