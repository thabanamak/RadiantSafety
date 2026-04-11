"""
Clean route polylines while keeping Mapbox road geometry.

Multi-stage pipeline:
  1. Dedupe near-coincident points.
  2. Remove self-intersecting loops (the main cause of "erratic" paths).
  3. Douglas–Peucker simplification — small epsilon to remove jitter, not shape.
  4. Collapse colinear triplets.
  5. Remove short spikes (out-and-back hooks at intersections).
  6. Collapse interchange clusters to single pass-through nodes.
  7. Chaikin corner-cutting for smooth, flowing curves.
"""

from __future__ import annotations

import math
from typing import List, Sequence, Tuple

from app.engine.pathfinding import haversine_m

_R = 6_371_000.0


def _latlon_to_xy(lat: float, lon: float, lat0: float, lon0: float) -> Tuple[float, float]:
    cos_lat = math.cos(math.radians(lat0))
    cos_lat = max(cos_lat, 0.25)
    x = math.radians(lon - lon0) * _R * cos_lat
    y = math.radians(lat - lat0) * _R
    return x, y


def _perpendicular_distance_m(
    p: Tuple[float, float],
    a: Tuple[float, float],
    c: Tuple[float, float],
    lat0: float,
    lon0: float,
) -> float:
    px, py = _latlon_to_xy(p[0], p[1], lat0, lon0)
    ax, ay = _latlon_to_xy(a[0], a[1], lat0, lon0)
    cx, cy = _latlon_to_xy(c[0], c[1], lat0, lon0)
    vx, vy = cx - ax, cy - ay
    wx, wy = px - ax, py - ay
    len2 = vx * vx + vy * vy
    if len2 < 1e-8:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, (wx * vx + wy * vy) / len2))
    qx, qy = ax + t * vx, ay + t * vy
    return math.hypot(px - qx, py - qy)


def _douglas_peucker(
    pts: Sequence[Tuple[float, float]],
    epsilon_m: float,
    lat0: float,
    lon0: float,
) -> List[Tuple[float, float]]:
    if len(pts) < 3:
        return list(pts)
    stack: List[Tuple[int, int]] = [(0, len(pts) - 1)]
    keep = {0, len(pts) - 1}
    while stack:
        i0, i1 = stack.pop()
        if i1 <= i0 + 1:
            continue
        a, c = pts[i0], pts[i1]
        worst_j = i0 + 1
        worst_d = 0.0
        for j in range(i0 + 1, i1):
            d = _perpendicular_distance_m(pts[j], a, c, lat0, lon0)
            if d > worst_d:
                worst_d = d
                worst_j = j
        if worst_d > epsilon_m:
            keep.add(worst_j)
            stack.append((i0, worst_j))
            stack.append((worst_j, i1))
    return [pts[i] for i in sorted(keep)]


def _dedupe_short_legs(pts: List[Tuple[float, float]], min_m: float) -> List[Tuple[float, float]]:
    if len(pts) < 2:
        return pts
    out = [pts[0]]
    for lat, lon in pts[1:]:
        if haversine_m(out[-1][0], out[-1][1], lat, lon) >= min_m:
            out.append((lat, lon))
        else:
            out[-1] = (lat, lon)
    return out


def _collapse_redundant_middle(pts: List[Tuple[float, float]], colinear_tol_m: float) -> List[Tuple[float, float]]:
    """Remove B when A-B-C is almost perfectly straight (street noise)."""
    if len(pts) < 3:
        return pts
    changed = True
    while changed:
        changed = False
        i = 1
        while i < len(pts) - 1:
            a, b, c = pts[i - 1], pts[i], pts[i + 1]
            dab = haversine_m(a[0], a[1], b[0], b[1])
            dbc = haversine_m(b[0], b[1], c[0], c[1])
            dac = haversine_m(a[0], a[1], c[0], c[1])
            if dab + dbc - dac < colinear_tol_m:
                del pts[i]
                changed = True
                if i > 1:
                    i -= 1
                continue
            i += 1
    return pts


def _remove_spikes(pts: List[Tuple[float, float]], max_sweeps: int = 16) -> List[Tuple[float, float]]:
    """Small out-and-back hooks along otherwise straight runs."""
    out = list(pts)
    for _ in range(max_sweeps):
        changed = False
        i = 1
        while i < len(out) - 1:
            a, b, c = out[i - 1], out[i], out[i + 1]
            dab = haversine_m(a[0], a[1], b[0], b[1])
            dbc = haversine_m(b[0], b[1], c[0], c[1])
            dac = haversine_m(a[0], a[1], c[0], c[1])
            excess = dab + dbc - dac
            short_leg = min(dab, dbc)

            if short_leg < 26.0 and excess > 6.0:
                del out[i]
                changed = True
                if i > 1:
                    i -= 1
                continue

            if short_leg < 14.0 and excess > 4.5:
                del out[i]
                changed = True
                if i > 1:
                    i -= 1
                continue

            i += 1
        if not changed:
            break
    return out


# ---------------------------------------------------------------------------
# Loop removal: cut self-intersecting segments
# ---------------------------------------------------------------------------

def _segments_intersect(
    a1: Tuple[float, float], a2: Tuple[float, float],
    b1: Tuple[float, float], b2: Tuple[float, float],
    lat0: float, lon0: float,
) -> bool:
    """True when segment a1-a2 crosses segment b1-b2 in the local equirectangular plane."""
    ax1, ay1 = _latlon_to_xy(a1[0], a1[1], lat0, lon0)
    ax2, ay2 = _latlon_to_xy(a2[0], a2[1], lat0, lon0)
    bx1, by1 = _latlon_to_xy(b1[0], b1[1], lat0, lon0)
    bx2, by2 = _latlon_to_xy(b2[0], b2[1], lat0, lon0)
    dx, dy = ax2 - ax1, ay2 - ay1
    ex, ey = bx2 - bx1, by2 - by1
    denom = dx * ey - dy * ex
    if abs(denom) < 1e-14:
        return False
    fx, fy = bx1 - ax1, by1 - ay1
    t = (fx * ey - fy * ex) / denom
    u = (fx * dy - fy * dx) / denom
    return 0.0 < t < 1.0 and 0.0 < u < 1.0


def _remove_loops(
    pts: List[Tuple[float, float]],
    lat0: float,
    lon0: float,
    max_sweeps: int = 8,
) -> List[Tuple[float, float]]:
    """
    Detect self-intersections and cut the shorter loop.
    A loop occurs when segment [i, i+1] crosses segment [j, j+1] (j > i+1).
    We remove whichever sub-path (i+1..j or j+1..i) is shorter by node count,
    keeping the overall path connected.
    """
    for _ in range(max_sweeps):
        n = len(pts)
        if n < 4:
            break
        found = False
        for i in range(n - 3):
            for j in range(i + 2, n - 1):
                if j == i + 1:
                    continue
                if _segments_intersect(pts[i], pts[i + 1], pts[j], pts[j + 1], lat0, lon0):
                    loop_len = j - i - 1
                    remainder = n - loop_len
                    if loop_len <= remainder:
                        pts = pts[: i + 1] + pts[j + 1:]
                    else:
                        pts = pts[: i + 1] + pts[j + 1:]
                    found = True
                    break
            if found:
                break
        if not found:
            break
    return pts


def _remove_backtrack_loops(
    pts: List[Tuple[float, float]],
    proximity_m: float = 50.0,
) -> List[Tuple[float, float]]:
    """
    Remove loops where the path revisits a point near one it already passed.
    If pts[j] is within proximity_m of pts[i] (j > i+2), snip the loop between them.
    """
    for _ in range(6):
        n = len(pts)
        if n < 4:
            break
        found = False
        for i in range(n - 3):
            for j in range(i + 3, n):
                if haversine_m(pts[i][0], pts[i][1], pts[j][0], pts[j][1]) < proximity_m:
                    pts = pts[: i + 1] + pts[j:]
                    found = True
                    break
            if found:
                break
        if not found:
            break
    return pts


# ---------------------------------------------------------------------------
# Interchange collapsing: treat dense node clusters as single pass-through
# ---------------------------------------------------------------------------

def _collapse_interchange_clusters(
    pts: List[Tuple[float, float]],
    cluster_radius_m: float = 45.0,
    min_cluster_size: int = 4,
) -> List[Tuple[float, float]]:
    """
    Identify clusters of nodes that are all within cluster_radius_m of each
    other (typical of highway interchanges or roundabouts), and replace the
    entire cluster with two points: the entry and exit points of the cluster.
    """
    if len(pts) < min_cluster_size + 2:
        return pts

    out: List[Tuple[float, float]] = []
    i = 0
    while i < len(pts):
        cluster_end = i
        for j in range(i + 1, len(pts)):
            all_close = all(
                haversine_m(pts[k][0], pts[k][1], pts[j][0], pts[j][1]) < cluster_radius_m
                for k in range(i, j)
            )
            if all_close:
                cluster_end = j
            else:
                break

        cluster_size = cluster_end - i + 1
        if cluster_size >= min_cluster_size:
            out.append(pts[i])
            out.append(pts[cluster_end])
            i = cluster_end + 1
        else:
            out.append(pts[i])
            i += 1
    return out


# ---------------------------------------------------------------------------
# Chaikin corner-cutting for smooth curves
# ---------------------------------------------------------------------------

def _chaikin_smooth(
    pts: List[Tuple[float, float]],
    iterations: int = 2,
) -> List[Tuple[float, float]]:
    """
    Chaikin's corner-cutting algorithm: each iteration replaces every segment
    A-B with two points at 25% and 75% along A-B, producing a smooth curve
    that converges toward a quadratic B-spline. Endpoints are preserved.
    """
    if len(pts) < 3:
        return pts
    result = list(pts)
    for _ in range(iterations):
        new: List[Tuple[float, float]] = [result[0]]
        for j in range(len(result) - 1):
            a, b = result[j], result[j + 1]
            q = (0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1])
            r = (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1])
            new.append(q)
            new.append(r)
        new.append(result[-1])
        result = new
    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def sanitize_route_polyline(
    path: Sequence[Tuple[float, float]],
    *,
    dedupe_min_m: float = 2.0,
    dp_epsilon_m: float = 1.25,
    colinear_tol_m: float = 0.95,
    smooth: bool = True,
) -> List[Tuple[float, float]]:
    if len(path) < 2:
        return list(path)
    pts = [(float(lat), float(lon)) for lat, lon in path]
    pts = _dedupe_short_legs(pts, dedupe_min_m)
    if len(pts) < 2:
        return [(float(path[0][0]), float(path[0][1])), (float(path[-1][0]), float(path[-1][1]))]

    lat0 = sum(p[0] for p in pts) / len(pts)
    lon0 = sum(p[1] for p in pts) / len(pts)

    # Stage 1: Remove self-intersecting loops and backtrack loops
    pts = _remove_loops(pts, lat0, lon0)
    pts = _remove_backtrack_loops(pts, proximity_m=50.0)

    # Stage 2: Douglas-Peucker simplification (tight epsilon preserves road shape)
    if len(pts) >= 3:
        pts = _douglas_peucker(pts, dp_epsilon_m, lat0, lon0)
    pts = _dedupe_short_legs(pts, dedupe_min_m)

    # Stage 3: Collapse colinear triplets and spikes
    if len(pts) >= 3:
        pts = _collapse_redundant_middle(list(pts), colinear_tol_m)
        pts = _remove_spikes(list(pts))
    pts = _dedupe_short_legs(pts, dedupe_min_m * 0.85)

    # Stage 4: Collapse interchange clusters
    pts = _collapse_interchange_clusters(pts)

    # Stage 5: Chaikin smoothing for flowing curves
    if smooth and len(pts) >= 3:
        pts = _chaikin_smooth(pts, iterations=2)

    if len(pts) < 2:
        return [(float(path[0][0]), float(path[0][1])), (float(path[-1][0]), float(path[-1][1]))]
    return pts
