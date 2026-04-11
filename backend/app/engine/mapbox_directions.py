"""
Fetch road- or path-snapped routes from Mapbox Directions API (same network as Mapbox GL).
"""

from __future__ import annotations

import os
from typing import List, Optional, Sequence, Tuple

import requests

from app.engine.pathfinding import HazardZone, haversine_m

MAPBOX_DIRECTIONS_URL = (
    "https://api.mapbox.com/directions/v5/mapbox/{profile}/{coords}.json"
)


def mapbox_access_token() -> str:
    """Prefer server secret; fall back to public token used by the Next.js map."""
    return (
        os.environ.get("MAPBOX_ACCESS_TOKEN", "").strip()
        or os.environ.get("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "").strip()
    )


def _parse_directions_routes(data: dict) -> List[Tuple[List[Tuple[float, float]], float, float]]:
    """Returns list of (path, distance_m, duration_s)."""
    out: List[Tuple[List[Tuple[float, float]], float, float]] = []
    for route in data.get("routes") or []:
        if not isinstance(route, dict):
            continue
        geom = route.get("geometry") or {}
        raw_coords = geom.get("coordinates") or []
        if not raw_coords:
            continue
        path: List[Tuple[float, float]] = [
            (float(c[1]), float(c[0])) for c in raw_coords if len(c) >= 2
        ]
        if len(path) < 2:
            continue
        dist = float(route.get("distance", 0.0) or 0.0)
        if dist <= 0:
            dist = sum(_segment_len_m(path[i - 1], path[i]) for i in range(1, len(path)))
        duration = float(route.get("duration", 0.0) or 0.0)
        out.append((path, dist, duration))
    return out


def fetch_mapbox_routes(
    stops_lat_lon: List[Tuple[float, float]],
    access_token: str,
    *,
    profile: str = "walking",
    alternatives: bool = False,
) -> Optional[List[Tuple[List[Tuple[float, float]], float, float]]]:
    """
    Ordered stops as (lat, lon). Mapbox allows up to 25 coordinates.
    When alternatives=True and there are exactly two stops, Mapbox may return multiple routes.
    """
    if profile not in ("walking", "cycling", "driving"):
        profile = "walking"
    if len(stops_lat_lon) < 2:
        return None
    if len(stops_lat_lon) > 25:
        head, tail = stops_lat_lon[0], stops_lat_lon[-1]
        mid = stops_lat_lon[1:-1]
        max_mid = 23
        if len(mid) > max_mid:
            mid = [mid[round(j * (len(mid) - 1) / (max_mid - 1))] for j in range(max_mid)]
        stops_lat_lon = [head, *mid, tail]
    coords = ";".join(f"{lon},{lat}" for lat, lon in stops_lat_lon)
    url = MAPBOX_DIRECTIONS_URL.format(profile=profile, coords=coords)
    params: dict = {
        "geometries": "geojson",
        "overview": "full",
        "steps": "false",
        "access_token": access_token,
    }
    if alternatives and len(stops_lat_lon) == 2:
        params["alternatives"] = "true"
    try:
        r = requests.get(url, params=params, timeout=45)
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    try:
        data = r.json()
    except ValueError:
        return None
    parsed = _parse_directions_routes(data)
    return parsed if parsed else None


def fetch_mapbox_directions_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    access_token: str,
    *,
    profile: str = "walking",
) -> Optional[Tuple[List[Tuple[float, float]], float, float]]:
    """
    Returns (waypoints as (lat, lon), distance_meters, duration_seconds) or None.
    """
    got = fetch_mapbox_routes(
        [(origin_lat, origin_lon), (dest_lat, dest_lon)],
        access_token,
        profile=profile,
        alternatives=False,
    )
    if not got:
        return None
    return got[0]


def _segment_len_m(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    return haversine_m(a[0], a[1], b[0], b[1])


def path_crosses_hard_hazard(
    path: Sequence[Tuple[float, float]],
    hazards: Sequence[HazardZone],
) -> bool:
    """True if any vertex or edge midpoint lies inside a hard hazard disk."""
    if not path or not hazards:
        return False
    for lat, lon in path:
        for hz in hazards:
            if hz.contains(lat, lon):
                return True
    for k in range(1, len(path)):
        a, b = path[k - 1], path[k]
        mid_lat = (a[0] + b[0]) * 0.5
        mid_lon = (a[1] + b[1]) * 0.5
        for hz in hazards:
            if hz.contains(mid_lat, mid_lon):
                return True
    return False
