/**
 * Street-snap: takes a raw A* grid path and converts it into a clean,
 * street-following route via the Mapbox Directions API.
 *
 * Strategy: smooth the grid path, pick one corridor waypoint (apex) that is
 * both far from the straight O→D line and (when heat samples are available)
 * as cold as possible in the upper part of the detour. Mapbox then walks
 * origin → apex → destination.
 *
 * Returned geometry is deduped, Douglas–Peucker simplified, and spike-stripped
 * so dense Mapbox vertices do not read as a redundant “spiderweb” on the map.
 */

import { haversineMeters } from "@/lib/geo-basics";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";
const EARTH_R = 6_371_000;

/** Perpendicular distance from point `p` to line segment `[a, b]` in degrees. */
function perpDistDeg(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const qx = a[0] + t * dx - p[0];
  const qy = a[1] + t * dy - p[1];
  return Math.sqrt(qx * qx + qy * qy);
}

function distM(a: [number, number], b: [number, number]): number {
  return haversineMeters(a[1], a[0], b[1], b[0]);
}

/** Local tangent-plane perpendicular distance from `p` to segment `a–c` (metres). */
function perpDistM(
  p: [number, number],
  a: [number, number],
  c: [number, number],
): number {
  const lat0 = (a[1] + c[1]) * 0.5;
  const lng0 = (a[0] + c[0]) * 0.5;
  const cosLat = Math.max(0.25, Math.cos((lat0 * Math.PI) / 180));
  const toXY = (lat: number, lng: number) => {
    const x = ((lng - lng0) * Math.PI) / 180 * EARTH_R * cosLat;
    const y = ((lat - lat0) * Math.PI) / 180 * EARTH_R;
    return [x, y] as const;
  };
  const [px, py] = toXY(p[1], p[0]);
  const [ax, ay] = toXY(a[1], a[0]);
  const [cx, cy] = toXY(c[1], c[0]);
  const vx = cx - ax;
  const vy = cy - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-8) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const qx = ax + t * vx;
  const qy = ay + t * vy;
  return Math.hypot(px - qx, py - qy);
}

function dedupeShortLegs(pts: [number, number][], minM: number): [number, number][] {
  if (pts.length < 2) return pts;
  const out: [number, number][] = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    if (distM(out[out.length - 1], pts[k]) >= minM) {
      out.push(pts[k]);
    } else {
      out[out.length - 1] = pts[k];
    }
  }
  return out;
}

function removeSpikes(pts: [number, number][], maxSweeps = 12): [number, number][] {
  let out = [...pts];
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let changed = false;
    let i = 1;
    while (i < out.length - 1) {
      const a = out[i - 1];
      const b = out[i];
      const c = out[i + 1];
      const dab = distM(a, b);
      const dbc = distM(b, c);
      const dac = distM(a, c);
      const excess = dab + dbc - dac;
      const shortLeg = Math.min(dab, dbc);

      if ((shortLeg < 26 && excess > 6) || (shortLeg < 14 && excess > 4.5)) {
        out.splice(i, 1);
        changed = true;
        if (i > 1) i--;
        continue;
      }
      i++;
    }
    if (!changed) break;
  }
  return out;
}

function douglasPeucker(pts: [number, number][], epsilonM: number): [number, number][] {
  if (pts.length < 3) return pts;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const keep = new Set<number>([0, pts.length - 1]);
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    if (i1 <= i0 + 1) continue;
    let worstJ = i0 + 1;
    let worstD = 0;
    for (let j = i0 + 1; j < i1; j++) {
      const d = perpDistM(pts[j], pts[i0], pts[i1]);
      if (d > worstD) {
        worstD = d;
        worstJ = j;
      }
    }
    if (worstD > epsilonM) {
      keep.add(worstJ);
      stack.push([i0, worstJ], [worstJ, i1]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((idx) => pts[idx]);
}

function collapseColinear(pts: [number, number][], colinearTolM: number): [number, number][] {
  if (pts.length < 3) return pts;
  const out = [...pts];
  let changed = true;
  while (changed) {
    changed = false;
    let i = 1;
    while (i < out.length - 1) {
      const a = out[i - 1];
      const b = out[i];
      const c = out[i + 1];
      const dab = distM(a, b);
      const dbc = distM(b, c);
      const dac = distM(a, c);
      if (dab + dbc - dac < colinearTolM) {
        out.splice(i, 1);
        changed = true;
        if (i > 1) i--;
        continue;
      }
      i++;
    }
  }
  return out;
}

function sanitizeSnappedLine(coords: [number, number][] | null): [number, number][] | null {
  if (!coords || coords.length < 2) return coords;
  let pts = dedupeShortLegs(coords, 3);
  pts = removeSpikes(pts);
  pts = douglasPeucker(pts, 11);
  pts = collapseColinear(pts, 3);
  return pts.length >= 2 ? pts : coords;
}

/**
 * From a raw A* grid path, pick one Mapbox waypoint on the smoothed detour.
 * With `pathHeats`, prefer a cold point among those in the upper half of
 * perpendicular deviation (still ≥ ~150 m when the detour is wide).
 */
function buildWaypoints(
  coords: [number, number][],
  pathHeats?: number[],
): [number, number][] {
  if (coords.length <= 2) return coords;

  const origin = coords[0];
  const dest = coords[coords.length - 1];

  const smoothed: [number, number][] = [origin];
  for (let i = 1; i < coords.length - 1; i++) {
    smoothed.push([
      (coords[i - 1][0] + coords[i][0] + coords[i + 1][0]) / 3,
      (coords[i - 1][1] + coords[i][1] + coords[i + 1][1]) / 3,
    ]);
  }
  smoothed.push(dest);

  let maxDist = 0;
  let maxIdx = -1;
  for (let i = 1; i < smoothed.length - 1; i++) {
    const d = perpDistDeg(smoothed[i], origin, dest);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  // ~150 m at Melbourne's latitude ≈ 0.0015°
  if (maxDist < 0.0015 || maxIdx < 0) {
    return [origin, dest];
  }

  const useHeat =
    pathHeats &&
    pathHeats.length === coords.length &&
    pathHeats.length >= 3;

  if (!useHeat) {
    return [origin, smoothed[maxIdx], dest];
  }

  const smoothedHeats: number[] = [];
  smoothedHeats[0] = pathHeats[0];
  for (let i = 1; i < coords.length - 1; i++) {
    smoothedHeats.push((pathHeats[i - 1]! + pathHeats[i]! + pathHeats[i + 1]!) / 3);
  }
  smoothedHeats.push(pathHeats[pathHeats.length - 1]!);

  const devFloor = Math.max(0.0015, maxDist * 0.45);
  let bestI = maxIdx;
  let bestHeat = smoothedHeats[maxIdx]!;
  let bestDev = perpDistDeg(smoothed[maxIdx]!, origin, dest);

  for (let i = 1; i < smoothed.length - 1; i++) {
    const d = perpDistDeg(smoothed[i]!, origin, dest);
    if (d < devFloor) continue;
    const sh = smoothedHeats[i]!;
    if (sh < bestHeat - 1e-12 || (Math.abs(sh - bestHeat) < 1e-12 && d > bestDev + 1e-12)) {
      bestHeat = sh;
      bestDev = d;
      bestI = i;
    }
  }

  return [origin, smoothed[bestI]!, dest];
}

/**
 * Snap a raw A* path to real walking streets via Mapbox Directions.
 *
 * At most 3 waypoints (origin + one detour apex + destination).
 */
export async function snapRouteToStreets(
  rawCoords: [number, number][],
  pathHeats?: number[],
): Promise<[number, number][] | null> {
  if (!MAPBOX_TOKEN || rawCoords.length < 2) return null;

  const waypoints = buildWaypoints(rawCoords, pathHeats);
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

    const raw = data.routes[0].geometry.coordinates;
    return sanitizeSnappedLine(raw);
  } catch {
    return null;
  }
}
