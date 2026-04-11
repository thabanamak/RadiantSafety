"""
FastAPI backend: route order — (1) OSM walk-network A*, (2) Mapbox walking Directions,
(3) heat-aware grid A* last resort. OSM edges follow real footpaths; Mapbox follows
roads/paths; the grid can cut across blocks and is only a fallback.
"""

from __future__ import annotations

import math
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Literal, Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.engine.mapbox_directions import (
    fetch_mapbox_routes,
    mapbox_access_token,
    path_crosses_hard_hazard,
)
from app.engine.pathfinding import (
    HazardZone,
    HeatSource,
    astar_route,
    filter_heat_sources_for_route,
    haversine_m,
    path_mean_heat,
    path_peak_heat,
)
from app.engine.road_network_astar import road_network_astar_route
from app.engine.polyline_sanitize import sanitize_route_polyline

logger = logging.getLogger(__name__)

# OSMnx / Overpass can hang a long time on first bbox; cap wait so we fall back to grid A*.
_ROAD_ASTAR_TIMEOUT_SEC = 22.0

# Load tokens from RadiantSafety/.env.local when uvicorn runs from backend/
_env_root = Path(__file__).resolve().parent.parent.parent
load_dotenv(_env_root / ".env.local")
load_dotenv(_env_root / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

app = FastAPI(
    title="RadiantSafety routing",
    description="Mapbox Directions with detour probing ranked by heat exposure; A* grid fallback.",
    version="1.6.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LatLon(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class HazardInput(BaseModel):
    latitude: float
    longitude: float
    radius_meters: float = Field(..., gt=0, le=50_000)


class IncidentPoint(BaseModel):
    latitude: float
    longitude: float
    """Relative weight (1–10 matches typical map incident intensity)."""
    intensity: float = Field(5.0, gt=0, le=20)
    """Gaussian spread in metres — wider = more red around the pin."""
    influence_meters: float = Field(220, gt=30, le=5000)


class RouteRequest(BaseModel):
    origin: LatLon
    destination: LatLon
    hazard_zones: List[HazardInput] = Field(default_factory=list)
    """Hard no-go disks (A* fallback avoids them; Mapbox line cannot respect arbitrary disks)."""
    incident_points: List[IncidentPoint] = Field(default_factory=list)
    """Soft heat sources — exposure is scored along the chosen path (heatmap-style field)."""
    mapbox_profile: Literal["walking", "cycling", "driving"] = Field(
        "walking",
        description="Mapbox Directions profile — snapped to paths/roads for that travel mode.",
    )
    grid_resolution_meters: float = Field(75, ge=25, le=500)
    padding_meters: float = Field(400, ge=50, le=5000)
    heat_penalty: float = Field(
        12.0,
        ge=0,
        le=80,
        description="A* grid fallback only: higher = stronger detour around hot cells.",
    )


class RouteResponse(BaseModel):
    waypoints: List[LatLon]
    distance_meters: float
    duration_seconds: float = Field(
        0.0,
        description="Estimated travel time in seconds (from Mapbox Directions).",
    )
    algorithm: str = "mapbox-directions"
    hard_zones: int
    mean_heat: float = Field(
        ...,
        description="Average heat (0–1) along the path — lower is cooler/safer corridor.",
    )
    peak_heat: float = Field(
        ...,
        description="Highest heat (0–1) at any waypoint — worst exposure on the route.",
    )


def _hard_hazards(body: RouteRequest) -> List[HazardZone]:
    return [HazardZone(z.latitude, z.longitude, z.radius_meters) for z in body.hazard_zones]


def _heat_sources(body: RouteRequest) -> List[HeatSource]:
    return [
        HeatSource(
            latitude=p.latitude,
            longitude=p.longitude,
            intensity=p.intensity,
            influence_meters=p.influence_meters,
        )
        for p in body.incident_points
    ]


def _path_length_m(path: List[Tuple[float, float]]) -> float:
    if len(path) < 2:
        return 0.0
    total = 0.0
    for k in range(1, len(path)):
        a, b = path[k - 1], path[k]
        total += haversine_m(a[0], a[1], b[0], b[1])
    return total


def _route_rank_key(
    path: List[Tuple[float, float]],
    heats: List[HeatSource],
    dist_m: float,
) -> Tuple[float, float, float]:
    """
    Lexicographic preference: minimise peak heat first, then mean heat, then
    distance — a longer detour wins whenever it stays cooler.
    """
    if not heats:
        return (0.0, 0.0, dist_m)
    peak = path_peak_heat(path, heats)
    mean = path_mean_heat(path, heats)
    return (peak, mean, dist_m * 1e-7)


def _offset_point(
    mid_lat: float, mid_lon: float,
    perp_lat: float, perp_lon: float,
    offset_m: float,
) -> Tuple[float, float]:
    """Shift (mid_lat, mid_lon) by offset_m along the perpendicular direction."""
    length = math.sqrt(perp_lat ** 2 + perp_lon ** 2)
    if length < 1e-12:
        return mid_lat, mid_lon
    scale = offset_m / (length * 111_320.0)
    return mid_lat + perp_lat * scale, mid_lon + perp_lon * scale


def _generate_detour_waypoints(
    o_lat: float, o_lon: float,
    d_lat: float, d_lon: float,
    heats: List[HeatSource],
) -> List[Tuple[float, float]]:
    """
    Create waypoints offset perpendicular to the O→D line at various distances.
    Mapbox will snap each to the nearest road, so geometry stays clean.
    """
    mid_lat = (o_lat + d_lat) / 2.0
    mid_lon = (o_lon + d_lon) / 2.0
    dx = d_lon - o_lon
    dy = d_lat - o_lat
    # Two perpendicular directions
    perp1 = (-dy, dx)
    perp2 = (dy, -dx)

    od_dist = haversine_m(o_lat, o_lon, d_lat, d_lon)
    # Offset distances: proportional to O-D distance, from small detour to wide
    offsets_m = [
        od_dist * 0.18,
        od_dist * 0.35,
        od_dist * 0.55,
        od_dist * 0.80,
    ]
    # Cap offsets so we don't create absurdly long detours
    offsets_m = [min(o, 2200.0) for o in offsets_m]

    waypoints: List[Tuple[float, float]] = []
    for off_m in offsets_m:
        if off_m < 35.0:
            continue
        waypoints.append(_offset_point(mid_lat, mid_lon, perp1[0], perp1[1], off_m))
        waypoints.append(_offset_point(mid_lat, mid_lon, perp2[0], perp2[1], off_m))

    # Also add quarter-points (25% and 75% along O→D) with offsets, for asymmetric heat
    for frac in (0.25, 0.75):
        q_lat = o_lat + frac * dy
        q_lon = o_lon + frac * dx
        for off_m in offsets_m[:2]:
            if off_m < 35.0:
                continue
            waypoints.append(_offset_point(q_lat, q_lon, perp1[0], perp1[1], off_m))
            waypoints.append(_offset_point(q_lat, q_lon, perp2[0], perp2[1], off_m))

    return waypoints


def _try_mapbox_alternatives(
    body: RouteRequest,
    hard: List[HazardZone],
    heats: List[HeatSource],
) -> Optional[Tuple[List[Tuple[float, float]], float, str]]:
    """
    1. Fetch direct O→D Mapbox routes (with alternatives).
    2. Generate detour candidates: O → offset_waypoint → D for many perpendicular
       offsets around the heat zone. Mapbox snaps each waypoint to a real road.
    3. Score all candidates by (peak_heat, mean_heat, distance) and return the coolest.

    Detour Mapbox calls run in parallel — previously they were sequential (~15+ HTTP
    round-trips), which made routing feel very slow.
    """
    token = mapbox_access_token()
    if not token:
        return None

    profile = body.mapbox_profile
    o_lat, o_lon = body.origin.latitude, body.origin.longitude
    d_lat, d_lon = body.destination.latitude, body.destination.longitude
    has_heat = bool(heats)

    # (path, distance_m, duration_s)
    candidates: List[Tuple[List[Tuple[float, float]], float, float]] = []

    # --- 1. Direct O→D with alternatives ---
    mb_direct = fetch_mapbox_routes(
        [(o_lat, o_lon), (d_lat, d_lon)],
        token,
        profile=profile,
        alternatives=has_heat,
    )
    if mb_direct:
        candidates.extend(mb_direct)

    # --- 2. Detour routes (parallel): each was ~1 HTTP; serial sum dominated latency ---
    if has_heat:
        detour_wps = _generate_detour_waypoints(o_lat, o_lon, d_lat, d_lon, heats)
        # Cap probes so we do not hammer Mapbox; spread across generated set
        max_detours = 10
        if len(detour_wps) > max_detours:
            step = (len(detour_wps) - 1) / float(max_detours - 1)
            detour_wps = [detour_wps[int(round(i * step))] for i in range(max_detours)]

        def _one_detour(wp: Tuple[float, float]) -> Optional[List[Tuple[List[Tuple[float, float]], float, float]]]:
            wp_lat, wp_lon = wp
            return fetch_mapbox_routes(
                [(o_lat, o_lon), (wp_lat, wp_lon), (d_lat, d_lon)],
                token,
                profile=profile,
                alternatives=False,
            )

        workers = min(8, max(1, len(detour_wps)))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(_one_detour, wp) for wp in detour_wps]
            for fut in as_completed(futures):
                try:
                    mb_detour = fut.result()
                    if mb_detour:
                        candidates.extend(mb_detour)
                except Exception:
                    continue

    if not candidates:
        return None

    # --- 3. Pick lowest heat ---
    best: Optional[Tuple[List[Tuple[float, float]], float, float, str]] = None
    best_key: Optional[Tuple[float, float, float]] = None
    for path, dist, dur in candidates:
        if path_crosses_hard_hazard(path, hard):
            continue
        label = f"mapbox-{profile}"
        key = _route_rank_key(path, heats, dist)
        if best_key is None or key < best_key:
            best_key = key
            best = (path, dist, dur, label)
    return best


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/route", response_model=RouteResponse)
def compute_route(body: RouteRequest) -> RouteResponse:
    hard = _hard_hazards(body)
    heats_all = _heat_sources(body)
    heats = filter_heat_sources_for_route(
        body.origin.latitude,
        body.origin.longitude,
        body.destination.latitude,
        body.destination.longitude,
        heats_all,
        max_sources=72,
    )

    path: Optional[List[Tuple[float, float]]] = None
    dist: float = 0.0
    dur: float = 0.0
    algorithm = "astar-osm-walk"

    # 1) A* on OSM pedestrian graph — edges are real walkable ways, not free-space grid
    # Daemon thread + join(timeout): after timeout we still return and fall back to grid/Mapbox
    # without blocking the next HTTP request (unlike a single-slot process pool).
    _osm_out: List[Optional[List[Tuple[float, float]]]] = [None]
    _osm_exc: List[Optional[BaseException]] = [None]

    def _osm_worker() -> None:
        try:
            _osm_out[0] = road_network_astar_route(
                body.origin.latitude,
                body.origin.longitude,
                body.destination.latitude,
                body.destination.longitude,
                hard,
                heats,
                heat_penalty=body.heat_penalty,
                bbox_pad_m=body.padding_meters,
            )
        except Exception as ex:
            _osm_exc[0] = ex
            _osm_out[0] = None

    _th = threading.Thread(target=_osm_worker, name="osm_astar", daemon=True)
    _th.start()
    _th.join(timeout=_ROAD_ASTAR_TIMEOUT_SEC)
    if _th.is_alive():
        logger.warning(
            "OSM walk A* timed out after %.0fs — falling back to Mapbox / grid",
            _ROAD_ASTAR_TIMEOUT_SEC,
        )
        path = None
    elif _osm_exc[0] is not None:
        logger.warning("OSM walk A* failed: %s — falling back to Mapbox / grid", _osm_exc[0])
        path = None
    else:
        path = _osm_out[0]

    if path is not None:
        dist = _path_length_m(path)
        if math.isnan(dist) or math.isinf(dist) or dist <= 0:
            dist = 0.0
        dur = dist / 1.39 if dist > 0 else 0.0
        algorithm = "astar-osm-walk"

    # 2) Mapbox walking — follows real roads / paths (heat-ranked detours). Prefer this over grid.
    if path is None:
        mb = _try_mapbox_alternatives(body, hard, heats)
        if mb is not None:
            path, dist, dur, algorithm = mb
            if math.isnan(dist) or math.isinf(dist) or dist <= 0:
                dist = _path_length_m(path)

    # 3) Grid A* — last resort only (cuts across blocks; not real pedestrian geometry)
    if path is None:
        path = astar_route(
            body.origin.latitude,
            body.origin.longitude,
            body.destination.latitude,
            body.destination.longitude,
            hard,
            heats,
            resolution_m=body.grid_resolution_meters,
            padding_m=body.padding_meters,
            heat_penalty=body.heat_penalty,
        )
        algorithm = "astar-grid-heat"
        if path is not None:
            dist = _path_length_m(path)
            if math.isnan(dist) or math.isinf(dist):
                dist = 0.0
            dur = dist / 1.39 if dist > 0 else 0.0

    if path is None:
        token_ok = bool(mapbox_access_token())
        if not token_ok:
            raise HTTPException(
                status_code=503,
                detail=(
                    "No route: set MAPBOX_ACCESS_TOKEN for Mapbox walking paths, install osmnx+networkx+scikit-learn "
                    "for OSM footpaths, or relax padding / hazards."
                ),
            )
        raise HTTPException(
            status_code=404,
            detail="No path found: try a shorter trip, expand padding, or lower grid resolution.",
        )

    # Sanitize: remove loops, simplify, smooth
    path = sanitize_route_polyline(path)
    dist = _path_length_m(path)
    if dist > 0:
        dur = dist / 1.39

    waypoints = [LatLon(latitude=lat, longitude=lon) for lat, lon in path]
    mean_h = path_mean_heat(path, heats) if heats else 0.0
    peak_h = path_peak_heat(path, heats) if heats else 0.0
    return RouteResponse(
        waypoints=waypoints,
        distance_meters=dist,
        duration_seconds=round(dur, 1),
        algorithm=algorithm,
        hard_zones=len(hard),
        mean_heat=round(mean_h, 4),
        peak_heat=round(peak_h, 4),
    )
