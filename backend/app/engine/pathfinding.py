"""
Grid-based A* over lat/lon with:
- Soft "heatmap" cost: incident-derived Gaussian heat → higher edge cost in hot cells
  (matches the idea of avoiding red on the map as much as possible).
- Optional hard hazard disks (absolute no-go), e.g. closed areas.
"""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

# Earth radius in metres (WGS84 approximate)
_R = 6_371_000.0


def haversine_m(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    """Great-circle distance in metres between two WGS84 points."""
    p1 = math.radians(a_lat)
    p2 = math.radians(b_lat)
    dphi = math.radians(b_lat - a_lat)
    dlmb = math.radians(b_lon - a_lon)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * _R * math.asin(min(1.0, math.sqrt(h)))


@dataclass(frozen=True)
class HazardZone:
    latitude: float
    longitude: float
    radius_meters: float

    def contains(self, lat: float, lon: float) -> bool:
        return haversine_m(self.latitude, self.longitude, lat, lon) <= self.radius_meters


@dataclass(frozen=True)
class HeatSource:
    """One incident / report — contributes a smooth heat bump (like mapbox heatmap)."""

    latitude: float
    longitude: float
    intensity: float = 1.0
    """Peak relative weight (roughly 0–10 scale, same spirit as mock incident intensity)."""
    influence_meters: float = 220.0
    """~1σ of the Gaussian bump; larger = wider red influence."""


def _cell_steps(lat_mid: float, resolution_m: float) -> Tuple[float, float]:
    """Degrees per cell for ~resolution_m square-ish cells at given latitude."""
    dlat = resolution_m / 111_320.0
    cos_lat = math.cos(math.radians(lat_mid))
    cos_lat = max(cos_lat, 0.2)
    dlon = resolution_m / (111_320.0 * cos_lat)
    return dlat, dlon


def _expand_bounds(
    min_lat: float,
    max_lat: float,
    min_lon: float,
    max_lon: float,
    pad_m: float,
    lat_mid: float,
) -> Tuple[float, float, float, float]:
    dlat, dlon = _cell_steps(lat_mid, pad_m)
    return min_lat - dlat, max_lat + dlat, min_lon - dlon, max_lon + dlon


def _lat_lon_to_ij(
    lat: float,
    lon: float,
    min_lat: float,
    min_lon: float,
    dlat: float,
    dlon: float,
) -> Tuple[int, int]:
    i = int(round((lat - min_lat) / dlat))
    j = int(round((lon - min_lon) / dlon))
    return i, j


def _ij_to_lat_lon(
    i: int,
    j: int,
    min_lat: float,
    min_lon: float,
    dlat: float,
    dlon: float,
) -> Tuple[float, float]:
    return min_lat + i * dlat, min_lon + j * dlon


def _build_blocked(
    rows: int,
    cols: int,
    min_lat: float,
    min_lon: float,
    dlat: float,
    dlon: float,
    hazards: Sequence[HazardZone],
) -> List[List[bool]]:
    blocked = [[False] * cols for _ in range(rows)]
    if not hazards:
        return blocked
    for i in range(rows):
        for j in range(cols):
            lat, lon = _ij_to_lat_lon(i, j, min_lat, min_lon, dlat, dlon)
            for hz in hazards:
                if hz.contains(lat, lon):
                    blocked[i][j] = True
                    break
    return blocked


def _min_dist_to_od_segment_m(
    s_lat: float,
    s_lon: float,
    o_lat: float,
    o_lon: float,
    d_lat: float,
    d_lon: float,
) -> float:
    """Approximate min great-circle distance (m) from point to segment O–D (via 3 samples)."""
    d0 = haversine_m(s_lat, s_lon, o_lat, o_lon)
    d1 = haversine_m(s_lat, s_lon, d_lat, d_lon)
    mid_lat = (o_lat + d_lat) * 0.5
    mid_lon = (o_lon + d_lon) * 0.5
    d2 = haversine_m(s_lat, s_lon, mid_lat, mid_lon)
    return min(d0, d1, d2)


def filter_heat_sources_for_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    sources: Sequence[HeatSource],
    *,
    max_sources: int = 72,
    corridor_factor: float = 1.35,
    corridor_floor_m: float = 3500.0,
) -> List[HeatSource]:
    """
    Keep only incidents near the O–D corridor so the grid stays local and heat
    evaluation stays fast (statewide lists used to blow up bbox and cell count).
    """
    if not sources:
        return []
    od_m = haversine_m(origin_lat, origin_lon, dest_lat, dest_lon)
    cutoff = max(corridor_floor_m, corridor_factor * od_m)
    scored: List[Tuple[float, HeatSource]] = []
    for s in sources:
        dm = _min_dist_to_od_segment_m(s.latitude, s.longitude, origin_lat, origin_lon, dest_lat, dest_lon)
        if dm <= cutoff:
            scored.append((dm, s))
    scored.sort(key=lambda x: x[0])
    return [s for _, s in scored[:max_sources]]


def _heat_at(lat: float, lon: float, sources: Sequence[HeatSource]) -> float:
    """
    Aggregate smooth heat in [0, 1] from all sources (Gaussian falloff).
    `influence_meters` is the approximate radius where heat is still noticeable
    (wider than a pin — similar to heatmap radius on the map).
    """
    if not sources:
        return 0.0
    total = 0.0
    for s in sources:
        d = haversine_m(s.latitude, s.longitude, lat, lon)
        # σ ≈ influence: at d = influence, cost is still ~⅓ of peak (not vanishingly small)
        sigma = max(s.influence_meters, 60.0)
        if d > 4.5 * sigma:
            continue
        w = max(s.intensity, 0.01)
        total += w * math.exp(-0.5 * (d / sigma) ** 2)
    denom = sum(max(s.intensity, 0.01) for s in sources)
    if denom <= 0:
        return 0.0
    raw = total / (denom + 1e-6)
    return raw / (1.0 + raw)


def heat_value_at(lat: float, lon: float, sources: Sequence[HeatSource]) -> float:
    """Incident-derived heat in [0, 1] at a point (for road-graph edge costs)."""
    return _heat_at(lat, lon, sources)


def _build_heat_grid(
    rows: int,
    cols: int,
    min_lat: float,
    min_lon: float,
    dlat: float,
    dlon: float,
    sources: Sequence[HeatSource],
) -> List[List[float]]:
    g: List[List[float]] = [[0.0] * cols for _ in range(rows)]
    if not sources:
        return g
    # Per-cell heat: sources list is already small after filtering
    for i in range(rows):
        for j in range(cols):
            lat, lon = _ij_to_lat_lon(i, j, min_lat, min_lon, dlat, dlon)
            g[i][j] = _heat_at(lat, lon, sources)
    return g


def _clamp_grid_resolution(
    min_lat: float,
    max_lat: float,
    min_lon: float,
    max_lon: float,
    lat_mid: float,
    resolution_m: float,
    max_cells: int = 10_000,
) -> Tuple[float, float, float, int, int]:
    """
    If the bbox would create too many cells, coarsen the grid (larger resolution_m)
    so A* stays responsive in Python.
    """
    dlat, dlon = _cell_steps(lat_mid, resolution_m)
    rows = max(3, int(math.ceil((max_lat - min_lat) / dlat)) + 1)
    cols = max(3, int(math.ceil((max_lon - min_lon) / dlon)) + 1)
    cells = rows * cols
    if cells <= max_cells:
        return dlat, dlon, resolution_m, rows, cols
    scale = math.sqrt(cells / float(max_cells))
    res2 = resolution_m * scale
    dlat2, dlon2 = _cell_steps(lat_mid, res2)
    rows2 = max(3, int(math.ceil((max_lat - min_lat) / dlat2)) + 1)
    cols2 = max(3, int(math.ceil((max_lon - min_lon) / dlon2)) + 1)
    return dlat2, dlon2, res2, rows2, cols2


def _neighbors(i: int, j: int, rows: int, cols: int) -> Iterable[Tuple[int, int]]:
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            if di == 0 and dj == 0:
                continue
            ni, nj = i + di, j + dj
            if 0 <= ni < rows and 0 <= nj < cols:
                yield ni, nj


def _nearest_free(
    i0: int,
    j0: int,
    blocked: List[List[bool]],
    rows: int,
    cols: int,
    max_steps: int = 5000,
) -> Optional[Tuple[int, int]]:
    """If start/end lies in a blocked cell, snap to nearest free cell by BFS."""
    if not blocked[i0][j0]:
        return i0, j0
    from collections import deque

    q: deque[Tuple[int, int]] = deque([(i0, j0)])
    seen = {(i0, j0)}
    steps = 0
    while q and steps < max_steps:
        i, j = q.popleft()
        steps += 1
        for ni, nj in _neighbors(i, j, rows, cols):
            if (ni, nj) in seen:
                continue
            seen.add((ni, nj))
            if not blocked[ni][nj]:
                return ni, nj
            q.append((ni, nj))
    return None


def astar_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    hard_hazards: Sequence[HazardZone],
    heat_sources: Sequence[HeatSource],
    *,
    resolution_m: float = 75.0,
    padding_m: float = 400.0,
    heat_penalty: float = 12.0,
) -> Optional[List[Tuple[float, float]]]:
    """
    A* where each edge cost = geographic_length * (1 + heat_penalty * mean_heat_on_edge).
    Hard hazards still block cells entirely.

    heat_penalty: how strongly to detour around hot areas (higher = more avoidance).
    """
    if resolution_m < 20:
        resolution_m = 20.0

    lat_mid = (origin_lat + dest_lat) / 2.0
    min_lat = min(origin_lat, dest_lat)
    max_lat = max(origin_lat, dest_lat)
    min_lon = min(origin_lon, dest_lon)
    max_lon = max(origin_lon, dest_lon)
    for hz in hard_hazards:
        r_deg_lat = hz.radius_meters / 111_320.0
        cos_l = math.cos(math.radians(hz.latitude))
        cos_l = max(cos_l, 0.2)
        r_deg_lon = hz.radius_meters / (111_320.0 * cos_l)
        min_lat = min(min_lat, hz.latitude - r_deg_lat)
        max_lat = max(max_lat, hz.latitude + r_deg_lat)
        min_lon = min(min_lon, hz.longitude - r_deg_lon)
        max_lon = max(max_lon, hz.longitude + r_deg_lon)

    # Do NOT expand bbox by every statewide heat source — that made grids huge and slow.
    min_lat, max_lat, min_lon, max_lon = _expand_bounds(
        min_lat, max_lat, min_lon, max_lon, padding_m, lat_mid
    )

    dlat, dlon, _res_eff, rows, cols = _clamp_grid_resolution(
        min_lat, max_lat, min_lon, max_lon, lat_mid, resolution_m
    )

    blocked = _build_blocked(rows, cols, min_lat, min_lon, dlat, dlon, hard_hazards)
    heat_grid = _build_heat_grid(rows, cols, min_lat, min_lon, dlat, dlon, heat_sources)

    oi, oj = _lat_lon_to_ij(origin_lat, origin_lon, min_lat, min_lon, dlat, dlon)
    oi = max(0, min(rows - 1, oi))
    oj = max(0, min(cols - 1, oj))
    di, dj = _lat_lon_to_ij(dest_lat, dest_lon, min_lat, min_lon, dlat, dlon)
    di = max(0, min(rows - 1, di))
    dj = max(0, min(cols - 1, dj))

    start = _nearest_free(oi, oj, blocked, rows, cols)
    goal = _nearest_free(di, dj, blocked, rows, cols)
    if start is None or goal is None:
        return None

    si, sj = start
    gi, gj = goal
    goal_lat, goal_lon = _ij_to_lat_lon(gi, gj, min_lat, min_lon, dlat, dlon)

    def h_geo(ii: int, jj: int) -> float:
        la, lo = _ij_to_lat_lon(ii, jj, min_lat, min_lon, dlat, dlon)
        return haversine_m(la, lo, goal_lat, goal_lon)

    # Admissible heuristic: costs are >= geometric length (multiplier >= 1)
    def h(ii: int, jj: int) -> float:
        return h_geo(ii, jj)

    open_heap: List[Tuple[float, float, int, int]] = []
    g_score: Dict[Tuple[int, int], float] = {}
    came: Dict[Tuple[int, int], Tuple[int, int]] = {}

    heapq.heappush(open_heap, (h(si, sj), 0.0, si, sj))
    g_score[(si, sj)] = 0.0

    while open_heap:
        f, g, i, j = heapq.heappop(open_heap)
        if g > g_score.get((i, j), math.inf) + 1e-9:
            continue
        if (i, j) == (gi, gj):
            path_ij: List[Tuple[int, int]] = []
            cur: Optional[Tuple[int, int]] = (i, j)
            while cur is not None:
                path_ij.append(cur)
                cur = came.get(cur)
            path_ij.reverse()
            return [
                _ij_to_lat_lon(ii, jj, min_lat, min_lon, dlat, dlon) for ii, jj in path_ij
            ]

        la, lo = _ij_to_lat_lon(i, j, min_lat, min_lon, dlat, dlon)
        hi = heat_grid[i][j]
        for ni, nj in _neighbors(i, j, rows, cols):
            if blocked[ni][nj]:
                continue
            hn = heat_grid[ni][nj]
            nlat, nlon = _ij_to_lat_lon(ni, nj, min_lat, min_lon, dlat, dlon)
            step = haversine_m(la, lo, nlat, nlon)
            mean_heat = 0.5 * (hi + hn)
            mult = 1.0 + heat_penalty * mean_heat
            step_cost = step * mult
            tentative = g_score[(i, j)] + step_cost
            key = (ni, nj)
            if tentative < g_score.get(key, math.inf):
                came[key] = (i, j)
                g_score[key] = tentative
                f_new = tentative + h(ni, nj)
                heapq.heappush(open_heap, (f_new, tentative, ni, nj))

    return None


def path_mean_heat(
    path: Sequence[Tuple[float, float]],
    sources: Sequence[HeatSource],
) -> float:
    """Average heat value (0–1) along waypoints — for API metrics."""
    if not path or not sources:
        return 0.0
    s = 0.0
    for lat, lon in path:
        s += _heat_at(lat, lon, sources)
    return s / len(path)


def path_peak_heat(
    path: Sequence[Tuple[float, float]],
    sources: Sequence[HeatSource],
) -> float:
    """Maximum heat (0–1) at any waypoint — how “red” the worst step is."""
    if not path or not sources:
        return 0.0
    return max(_heat_at(lat, lon, sources) for lat, lon in path)
