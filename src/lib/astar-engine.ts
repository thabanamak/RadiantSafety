/**
 * Client-side A* pathfinding engine for RadiantSafety.
 *
 * Generates a discrete grid over the bounding box of start→end (plus a 20 %
 * margin so the route can swing wide around large hotspots), then runs A*
 * with a safety-weighted cost function.
 *
 * Cost model
 * ──────────
 *   f(n) = g(n) + h(n)
 *
 *   g(n) — accumulated *real* movement cost from the origin:
 *          step_distance × (1 + heatPenalty × mean_heat_on_edge)
 *
 *          • step_distance is haversine metres between adjacent cells
 *            (× √2 for diagonal moves).
 *          • mean_heat_on_edge is the average of the departure cell's heat
 *            and the arrival cell's heat, where "heat" is the aggregated
 *            Gaussian crime intensity at a grid cell (range [0, 1]).
 *          • heatPenalty controls how aggressively the route avoids hotspots
 *            (default 14 → a hot cell costs ~15× more than a cool one).
 *
 *   h(n) — admissible heuristic: haversine distance to the target cell.
 *          Always ≤ true cost, so optimality is preserved.
 *
 * Edge cases
 * ──────────
 * • Start inside a hotspot: no cell is ever hard-blocked (only penalised),
 *   so the path will find the fastest exit from the hot zone — it cannot
 *   freeze.  Hard-blocked zones (HazardZone) do block cells, but BFS snap
 *   relocates the start/end to the nearest free cell.
 * • Diagonals allowed: 8-connected grid, diagonal cost multiplied by √2.
 *
 * Performance
 * ───────────
 * • Binary-heap priority queue (no Map overhead for the open set).
 * • Heat grid is pre-computed once; per-step cost is O(1) table lookup.
 * • Grid auto-coarsens if cell count exceeds MAX_CELLS (default 12 000)
 *   so worst-case A* is well under 2 s on a modern browser.
 * • Corridor filter prunes incidents far from the route envelope.
 *
 * Output: Mapbox-ready coordinate array  [[lng, lat], [lng, lat], …]
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single crime / incident contributing Gaussian heat. */
export interface HeatSource {
  latitude: number;
  longitude: number;
  /** Peak weight, 0-10 scale (same as SafeRouteIncident.intensity). */
  intensity: number;
  /** ~1σ of the Gaussian bump in metres. */
  influenceMeters: number;
}

/** Absolute no-go disk (e.g. closed area, active emergency). */
export interface HazardZone {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface AStarOptions {
  /** Grid cell size in metres (default 80). Smaller = more precise but slower. */
  resolutionM?: number;
  /** How heavily to penalise hot cells (default 14). */
  heatPenalty?: number;
  /** Max total grid cells before auto-coarsening kicks in (default 12 000). */
  maxCells?: number;
  /** BBox margin as a fraction of the O→D span (default 0.20 = 20 %). */
  bboxMarginFrac?: number;
}

export interface AStarResult {
  /** Mapbox-ready path: [[lng, lat], …] */
  path: [number, number][];
  /** Total walking distance in metres along the path. */
  distanceMeters: number;
  /** Estimated walking duration in seconds (at ~5 km/h). */
  durationSeconds: number;
  /** Average heat value [0, 1] sampled along the path. */
  meanHeat: number;
  /** Peak heat value [0, 1] at the worst step. */
  peakHeat: number;
  /** Effective grid dimensions that were used. */
  gridSize: { rows: number; cols: number };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const EARTH_R = 6_371_000; // metres, WGS-84 approximate
const SQRT2 = Math.SQRT2;
const DEG_TO_RAD = Math.PI / 180;
const WALK_SPEED_MS = 1.39; // ~5 km/h

// ─── Geo helpers ────────────────────────────────────────────────────────────

/** Great-circle distance in metres (haversine). */
function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const p1 = lat1 * DEG_TO_RAD;
  const p2 = lat2 * DEG_TO_RAD;
  const dp = (lat2 - lat1) * DEG_TO_RAD;
  const dl = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dp * 0.5) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl * 0.5) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1.0, Math.sqrt(a)));
}

/**
 * Degrees-per-cell at a given latitude for roughly `resM`-metre square cells.
 * Longitude degrees shrink with cos(lat).
 */
function cellSteps(
  latMid: number,
  resM: number,
): { dLat: number; dLon: number } {
  const dLat = resM / 111_320;
  const cosLat = Math.max(0.2, Math.cos(latMid * DEG_TO_RAD));
  const dLon = resM / (111_320 * cosLat);
  return { dLat, dLon };
}

// ─── Grid helpers ───────────────────────────────────────────────────────────

interface GridMeta {
  rows: number;
  cols: number;
  minLat: number;
  minLon: number;
  dLat: number;
  dLon: number;
  effectiveResM: number;
}

/**
 * Build grid metadata: bounding box with 20 % margin, clamped to MAX_CELLS.
 * Hard-hazard disks are expanded into the bbox so the grid can route around them.
 */
function buildGridMeta(
  oLat: number,
  oLon: number,
  dLat: number,
  dLon: number,
  hazards: HazardZone[],
  resolutionM: number,
  maxCells: number,
  marginFrac: number,
): GridMeta {
  let minLat = Math.min(oLat, dLat);
  let maxLat = Math.max(oLat, dLat);
  let minLon = Math.min(oLon, dLon);
  let maxLon = Math.max(oLon, dLon);

  // Expand bbox to include hard hazard disks
  for (const hz of hazards) {
    const rDegLat = hz.radiusMeters / 111_320;
    const cosL = Math.max(0.2, Math.cos(hz.latitude * DEG_TO_RAD));
    const rDegLon = hz.radiusMeters / (111_320 * cosL);
    minLat = Math.min(minLat, hz.latitude - rDegLat);
    maxLat = Math.max(maxLat, hz.latitude + rDegLat);
    minLon = Math.min(minLon, hz.longitude - rDegLon);
    maxLon = Math.max(maxLon, hz.longitude + rDegLon);
  }

  // 20 % margin so the path can swing around hotspots near the edges
  const spanLat = maxLat - minLat;
  const spanLon = maxLon - minLon;
  minLat -= spanLat * marginFrac;
  maxLat += spanLat * marginFrac;
  minLon -= spanLon * marginFrac;
  maxLon += spanLon * marginFrac;

  const latMid = (minLat + maxLat) * 0.5;
  let { dLat: stepLat, dLon: stepLon } = cellSteps(latMid, resolutionM);
  let rows = Math.max(3, Math.ceil((maxLat - minLat) / stepLat) + 1);
  let cols = Math.max(3, Math.ceil((maxLon - minLon) / stepLon) + 1);
  let effectiveRes = resolutionM;

  // Auto-coarsen if too many cells
  if (rows * cols > maxCells) {
    const scale = Math.sqrt((rows * cols) / maxCells);
    effectiveRes = resolutionM * scale;
    const coarse = cellSteps(latMid, effectiveRes);
    stepLat = coarse.dLat;
    stepLon = coarse.dLon;
    rows = Math.max(3, Math.ceil((maxLat - minLat) / stepLat) + 1);
    cols = Math.max(3, Math.ceil((maxLon - minLon) / stepLon) + 1);
  }

  return {
    rows,
    cols,
    minLat,
    minLon,
    dLat: stepLat,
    dLon: stepLon,
    effectiveResM: effectiveRes,
  };
}

/** Convert (lat, lon) → grid indices (row, col). */
function toIJ(
  lat: number,
  lon: number,
  g: GridMeta,
): [number, number] {
  const i = Math.round((lat - g.minLat) / g.dLat);
  const j = Math.round((lon - g.minLon) / g.dLon);
  return [
    Math.max(0, Math.min(g.rows - 1, i)),
    Math.max(0, Math.min(g.cols - 1, j)),
  ];
}

/** Convert grid indices → (lat, lon). */
function toLatLon(
  i: number,
  j: number,
  g: GridMeta,
): [number, number] {
  return [g.minLat + i * g.dLat, g.minLon + j * g.dLon];
}

// ─── Heat field ─────────────────────────────────────────────────────────────

/**
 * Pre-filter sources to a corridor around O→D so we don't waste cycles on
 * far-away incidents. Keeps the closest `maxSources` within a distance
 * proportional to the O-D span.
 */
function filterSources(
  oLat: number,
  oLon: number,
  dLat: number,
  dLon: number,
  sources: HeatSource[],
  maxSources = 80,
): HeatSource[] {
  if (sources.length === 0) return [];
  const odM = haversineM(oLat, oLon, dLat, dLon);
  const cutoff = Math.max(3500, 1.35 * odM);
  const midLat = (oLat + dLat) * 0.5;
  const midLon = (oLon + dLon) * 0.5;

  const scored: { d: number; s: HeatSource }[] = [];
  for (const s of sources) {
    const d0 = haversineM(s.latitude, s.longitude, oLat, oLon);
    const d1 = haversineM(s.latitude, s.longitude, dLat, dLon);
    const d2 = haversineM(s.latitude, s.longitude, midLat, midLon);
    const d = Math.min(d0, d1, d2);
    if (d <= cutoff) scored.push({ d, s });
  }
  scored.sort((a, b) => a.d - b.d);
  return scored.slice(0, maxSources).map((x) => x.s);
}

/**
 * Aggregate Gaussian heat [0, 1] at a single point from all nearby sources.
 * This mirrors the Python `_heat_at` exactly: Gaussian falloff per source,
 * sum normalised by total source weight, then compressed with x/(1+x).
 */
function heatAt(lat: number, lon: number, sources: HeatSource[]): number {
  if (sources.length === 0) return 0;

  let total = 0;
  let denom = 0;

  for (let k = 0; k < sources.length; k++) {
    const s = sources[k];
    const w = Math.max(s.intensity, 0.01);
    denom += w;

    const sigma = Math.max(s.influenceMeters, 60);
    const d = haversineM(s.latitude, s.longitude, lat, lon);
    if (d > 4.5 * sigma) continue; // negligible contribution
    total += w * Math.exp(-0.5 * (d / sigma) ** 2);
  }

  if (denom <= 0) return 0;
  const raw = total / (denom + 1e-6);
  return raw / (1 + raw); // soft-sigmoid compression into [0,1)
}

/**
 * Build a flat Float32Array heat grid (row-major).  Using a typed array
 * instead of number[][] avoids GC pressure on large grids and lets the
 * per-step cost be a simple indexed lookup.
 */
function buildHeatGrid(g: GridMeta, sources: HeatSource[]): Float32Array {
  const heat = new Float32Array(g.rows * g.cols);
  if (sources.length === 0) return heat;

  for (let i = 0; i < g.rows; i++) {
    const lat = g.minLat + i * g.dLat;
    const base = i * g.cols;
    for (let j = 0; j < g.cols; j++) {
      const lon = g.minLon + j * g.dLon;
      heat[base + j] = heatAt(lat, lon, sources);
    }
  }
  return heat;
}

// ─── Hard-hazard blocked set ────────────────────────────────────────────────

/** Build a Uint8Array of blocked cells (1 = blocked, 0 = passable). */
function buildBlocked(g: GridMeta, hazards: HazardZone[]): Uint8Array {
  const blocked = new Uint8Array(g.rows * g.cols);
  if (hazards.length === 0) return blocked;

  for (let i = 0; i < g.rows; i++) {
    const lat = g.minLat + i * g.dLat;
    const base = i * g.cols;
    for (let j = 0; j < g.cols; j++) {
      const lon = g.minLon + j * g.dLon;
      for (const hz of hazards) {
        if (haversineM(hz.latitude, hz.longitude, lat, lon) <= hz.radiusMeters) {
          blocked[base + j] = 1;
          break;
        }
      }
    }
  }
  return blocked;
}

/**
 * BFS snap: if the origin or destination lands in a hard-blocked cell,
 * find the nearest free cell so the algorithm doesn't immediately fail.
 */
function nearestFree(
  i0: number,
  j0: number,
  blocked: Uint8Array,
  g: GridMeta,
  maxSteps = 5000,
): [number, number] | null {
  if (!blocked[i0 * g.cols + j0]) return [i0, j0];

  const queue: [number, number][] = [[i0, j0]];
  const seen = new Set<number>();
  seen.add(i0 * g.cols + j0);
  let head = 0;
  let steps = 0;

  while (head < queue.length && steps < maxSteps) {
    const [ci, cj] = queue[head++];
    steps++;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || ni >= g.rows || nj < 0 || nj >= g.cols) continue;
        const key = ni * g.cols + nj;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!blocked[key]) return [ni, nj];
        queue.push([ni, nj]);
      }
    }
  }
  return null;
}

// ─── Binary-heap priority queue ─────────────────────────────────────────────

/**
 * Minimal binary min-heap storing (f-score, flatIndex).
 * Faster than a generic JS PriorityQueue library because it avoids object
 * allocation per entry (just two numbers per slot) and never resizes downward.
 */
class MinHeap {
  private fs: number[] = [];
  private ids: number[] = [];
  get size() {
    return this.fs.length;
  }
  push(f: number, id: number) {
    let i = this.fs.length;
    this.fs.push(f);
    this.ids.push(id);
    // bubble up
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.fs[parent] <= this.fs[i]) break;
      this._swap(i, parent);
      i = parent;
    }
  }
  pop(): [number, number] {
    const f = this.fs[0];
    const id = this.ids[0];
    const last = this.fs.length - 1;
    if (last > 0) {
      this.fs[0] = this.fs[last];
      this.ids[0] = this.ids[last];
    }
    this.fs.pop();
    this.ids.pop();
    if (this.fs.length > 0) this._sinkDown(0);
    return [f, id];
  }
  private _swap(a: number, b: number) {
    let t = this.fs[a];
    this.fs[a] = this.fs[b];
    this.fs[b] = t;
    t = this.ids[a];
    this.ids[a] = this.ids[b];
    this.ids[b] = t;
  }
  private _sinkDown(i: number) {
    const n = this.fs.length;
    for (;;) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.fs[l] < this.fs[smallest]) smallest = l;
      if (r < n && this.fs[r] < this.fs[smallest]) smallest = r;
      if (smallest === i) break;
      this._swap(i, smallest);
      i = smallest;
    }
  }
}

// ─── The 8-directional neighbour offsets ─────────────────────────────────────

// [deltaRow, deltaCol, distanceMultiplier]
const DIRS: [number, number, number][] = [
  [-1, 0, 1],
  [1, 0, 1],
  [0, -1, 1],
  [0, 1, 1],
  [-1, -1, SQRT2],
  [-1, 1, SQRT2],
  [1, -1, SQRT2],
  [1, 1, SQRT2],
];

// ─── Main A* ────────────────────────────────────────────────────────────────

/**
 * Run A* from `start` [lng, lat] to `end` [lng, lat] over a dynamically
 * generated grid, returning a Mapbox-ready coordinate array.
 *
 * Returns `null` when no path exists (all corridors are hard-blocked).
 */
export function astarSafeRoute(
  start: [number, number],
  end: [number, number],
  incidents: HeatSource[],
  hazards: HazardZone[] = [],
  opts: AStarOptions = {},
): AStarResult | null {
  const {
    resolutionM = 80,
    heatPenalty = 14,
    maxCells = 12_000,
    bboxMarginFrac = 0.2,
  } = opts;

  const [sLon, sLat] = start; // Mapbox convention: [lng, lat]
  const [eLon, eLat] = end;

  // ── 1. Corridor-filter incidents ──────────────────────────────────────
  const sources = filterSources(sLat, sLon, eLat, eLon, incidents);

  // ── 2. Build grid ─────────────────────────────────────────────────────
  const g = buildGridMeta(
    sLat, sLon, eLat, eLon,
    hazards,
    Math.max(resolutionM, 20),
    maxCells,
    bboxMarginFrac,
  );
  const totalCells = g.rows * g.cols;

  // ── 3. Pre-compute heat and blocked grids ─────────────────────────────
  const heat = buildHeatGrid(g, sources);
  const blocked = buildBlocked(g, hazards);

  // ── 4. Snap start / end into grid ─────────────────────────────────────
  const [oi, oj] = toIJ(sLat, sLon, g);
  const [di, dj] = toIJ(eLat, eLon, g);

  const startCell = nearestFree(oi, oj, blocked, g);
  const goalCell = nearestFree(di, dj, blocked, g);
  if (!startCell || !goalCell) return null;

  const [si, sj] = startCell;
  const [gi, gj] = goalCell;
  const goalFlat = gi * g.cols + gj;

  // Pre-compute target lat/lon for the heuristic
  const [goalLat, goalLon] = toLatLon(gi, gj, g);

  // ── 5. A* search ──────────────────────────────────────────────────────

  // g-scores: Infinity means unvisited; Float32 is 2× smaller than Float64,
  // cutting memory on big grids.  Precision loss is acceptable (we only
  // compare relative order of metres-scale costs).
  const gScore = new Float32Array(totalCells).fill(Infinity);
  const cameFrom = new Int32Array(totalCells).fill(-1);
  const heap = new MinHeap();

  const startFlat = si * g.cols + sj;
  gScore[startFlat] = 0;
  const startH = haversineM(...toLatLon(si, sj, g), goalLat, goalLon);
  heap.push(startH, startFlat);

  // Pre-compute base step distances for cardinal and diagonal moves.
  // Within a grid of uniform cell size, all cardinal steps are roughly the
  // same length and all diagonal steps are √2× that.  Pre-computing avoids
  // calling haversine for every edge expansion (the dominant cost).
  const cardinalStepM = g.effectiveResM;
  const diagonalStepM = g.effectiveResM * SQRT2;

  while (heap.size > 0) {
    const [, curFlat] = heap.pop();

    if (curFlat === goalFlat) break; // found target

    const curG = gScore[curFlat];
    // Stale entry (we found a shorter path to this node already)
    if (curG === Infinity) continue;

    const ci = (curFlat / g.cols) | 0;
    const cj = curFlat - ci * g.cols;
    const curHeat = heat[curFlat];

    for (let d = 0; d < 8; d++) {
      const [dri, drj, distMul] = DIRS[d];
      const ni = ci + dri;
      const nj = cj + drj;
      if (ni < 0 || ni >= g.rows || nj < 0 || nj >= g.cols) continue;

      const nFlat = ni * g.cols + nj;
      if (blocked[nFlat]) continue;

      // Edge cost = physical distance × safety multiplier
      const stepM = distMul === 1 ? cardinalStepM : diagonalStepM;
      const meanHeat = 0.5 * (curHeat + heat[nFlat]);
      const cost = stepM * (1 + heatPenalty * meanHeat);

      const tentG = curG + cost;
      if (tentG >= gScore[nFlat]) continue;

      gScore[nFlat] = tentG;
      cameFrom[nFlat] = curFlat;

      // Heuristic: haversine to goal (admissible — always ≤ true cost)
      const [nLat, nLon] = toLatLon(ni, nj, g);
      const h = haversineM(nLat, nLon, goalLat, goalLon);
      heap.push(tentG + h, nFlat);
    }
  }

  // ── 6. Reconstruct path ───────────────────────────────────────────────
  if (gScore[goalFlat] === Infinity) return null; // no path

  const pathFlat: number[] = [];
  let cur = goalFlat;
  while (cur !== -1) {
    pathFlat.push(cur);
    cur = cameFrom[cur];
  }
  pathFlat.reverse();

  // Convert to Mapbox [lng, lat] and compute metrics
  const path: [number, number][] = [];
  let distanceM = 0;
  let heatSum = 0;
  let peakHeat = 0;
  let prevLat = 0;
  let prevLon = 0;

  for (let k = 0; k < pathFlat.length; k++) {
    const flat = pathFlat[k];
    const ri = (flat / g.cols) | 0;
    const rj = flat - ri * g.cols;
    const [lat, lon] = toLatLon(ri, rj, g);
    path.push([lon, lat]); // Mapbox: [lng, lat]

    const h = heat[flat];
    heatSum += h;
    if (h > peakHeat) peakHeat = h;

    if (k > 0) {
      distanceM += haversineM(prevLat, prevLon, lat, lon);
    }
    prevLat = lat;
    prevLon = lon;
  }

  return {
    path,
    distanceMeters: Math.round(distanceM),
    durationSeconds: Math.round(distanceM / WALK_SPEED_MS),
    meanHeat: pathFlat.length > 0 ? heatSum / pathFlat.length : 0,
    peakHeat,
    gridSize: { rows: g.rows, cols: g.cols },
  };
}

// ─── Convenience: convert from the app's SafeRouteIncident shape ─────────

/**
 * Adapter from the existing `SafeRouteIncident` type used by the rest of the
 * app to the `HeatSource` shape this engine expects.
 */
export function incidentToHeatSource(inc: {
  latitude: number;
  longitude: number;
  intensity: number;
  influence_meters: number;
}): HeatSource {
  return {
    latitude: inc.latitude,
    longitude: inc.longitude,
    intensity: inc.intensity,
    influenceMeters: inc.influence_meters,
  };
}
