"""
Clean route polylines while keeping Mapbox road geometry.

- Douglas–Peucker with a **small** epsilon (~1.2 m) removes zig-zag noise along
  straight streets without chord-cutting across blocks (large ε caused that).
- Tight colinear collapse + short spike removal for tiny hooks at intersections.
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
    """Remove B when A–B–C is almost perfectly straight (street noise)."""
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


def sanitize_route_polyline(
    path: Sequence[Tuple[float, float]],
    *,
    dedupe_min_m: float = 2.0,
    dp_epsilon_m: float = 1.25,
    colinear_tol_m: float = 0.95,
) -> List[Tuple[float, float]]:
    if len(path) < 2:
        return list(path)
    pts = [(float(lat), float(lon)) for lat, lon in path]
    pts = _dedupe_short_legs(pts, dedupe_min_m)
    if len(pts) < 2:
        return [(float(path[0][0]), float(path[0][1])), (float(path[-1][0]), float(path[-1][1]))]

    lat0 = sum(p[0] for p in pts) / len(pts)
    lon0 = sum(p[1] for p in pts) / len(pts)

    if len(pts) >= 3:
        pts = _douglas_peucker(pts, dp_epsilon_m, lat0, lon0)
    pts = _dedupe_short_legs(pts, dedupe_min_m)
    if len(pts) >= 3:
        pts = _collapse_redundant_middle(list(pts), colinear_tol_m)
        pts = _remove_spikes(list(pts))
    pts = _dedupe_short_legs(pts, dedupe_min_m * 0.85)

    if len(pts) < 2:
        return [(float(path[0][0]), float(path[0][1])), (float(path[-1][0]), float(path[-1][1]))]
    return pts
