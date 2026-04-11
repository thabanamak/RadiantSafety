"""
A* on an OpenStreetMap *pedestrian* network (walk / foot paths only).

Unlike the lat/lon grid A*, movement is restricted to OSM edges — you cannot
cut across blocks or off-network. Edge cost blends path length with the same
incident heat field used elsewhere.
"""

from __future__ import annotations

import logging
import math
from typing import Any, List, Optional, Sequence, Tuple

from app.engine.pathfinding import HazardZone, HeatSource, haversine_m, heat_value_at

logger = logging.getLogger(__name__)

try:
    import osmnx as ox
except ImportError:
    ox = None  # type: ignore[misc, assignment]


def _node_latlon(G: Any, n: int) -> Tuple[float, float]:
    return float(G.nodes[n]["y"]), float(G.nodes[n]["x"])


def _edge_blocked_by_hazards(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    hazards: Sequence[HazardZone],
) -> bool:
    mid_lat = 0.5 * (lat1 + lat2)
    mid_lon = 0.5 * (lon1 + lon2)
    for hz in hazards:
        if hz.contains(lat1, lon1) or hz.contains(lat2, lon2) or hz.contains(mid_lat, mid_lon):
            return True
    return False


def _bbox_pad_degrees(o_lat: float, o_lon: float, d_lat: float, d_lon: float, pad_m: float) -> Tuple[float, float, float, float]:
    mid_lat = (o_lat + d_lat) / 2.0
    cos_lat = max(0.2, math.cos(math.radians(mid_lat)))
    dlat = pad_m / 111_320.0
    dlon = pad_m / (111_320.0 * cos_lat)
    north = max(o_lat, d_lat) + dlat
    south = min(o_lat, d_lat) - dlat
    east = max(o_lon, d_lon) + dlon
    west = min(o_lon, d_lon) - dlon
    return north, south, east, west


def road_network_astar_route(
    o_lat: float,
    o_lon: float,
    d_lat: float,
    d_lon: float,
    hard: Sequence[HazardZone],
    heats: Sequence[HeatSource],
    *,
    heat_penalty: float,
    bbox_pad_m: float,
    max_snap_m: float = 450.0,
) -> Optional[List[Tuple[float, float]]]:
    """
    Return path as [(lat, lon), ...] along OSM walk edges, or None if unavailable.

    Requires the `osmnx` package and network access to the Overpass API on first
    download for a bbox (results are cached by OSMnx).
    """
    if ox is None:
        logger.warning("osmnx is not installed — install backend requirements for road A*.")
        return None

    try:
        import networkx as nx
    except ImportError:
        logger.warning("networkx is not installed — run: python3 -m pip install -r requirements.txt")
        return None

    od_m = haversine_m(o_lat, o_lon, d_lat, d_lon)
    pad = max(bbox_pad_m, min(3500.0, 450.0 + 0.45 * od_m))
    north, south, east, west = _bbox_pad_degrees(o_lat, o_lon, d_lat, d_lon, pad)

    try:
        ox.settings.use_cache = True
        ox.settings.log_console = False
        try:
            # OSMnx 2.x — keyword `bbox` only (avoids FutureWarning on deprecated N/S/E/W args).
            # Tuple is (left/west, bottom/south, right/east, top/north) in degrees.
            G = ox.graph_from_bbox(
                bbox=(west, south, east, north),
                network_type="walk",
                simplify=True,
            )
        except TypeError:
            # OSMnx 1.x — positional north, south, east, west
            G = ox.graph_from_bbox(north, south, east, west, network_type="walk", simplify=True)
    except Exception as e:
        logger.warning("OSMnx graph download failed: %s", e)
        return None

    if G is None or len(G) == 0:
        return None

    try:
        G = ox.utils_graph.get_largest_component(G, strongly=False)
    except Exception:
        try:
            from osmnx import utils_graph as _ug

            G = _ug.get_largest_component(G, strongly=False)
        except Exception:
            pass

    if len(G) == 0:
        return None

    try:
        orig = ox.distance.nearest_nodes(G, X=o_lon, Y=o_lat)
        dest = ox.distance.nearest_nodes(G, X=d_lon, Y=d_lat)
    except Exception as e:
        logger.warning("nearest_nodes failed: %s", e)
        return None

    o_snap_lat, o_snap_lon = _node_latlon(G, orig)
    d_snap_lat, d_snap_lon = _node_latlon(G, dest)
    if haversine_m(o_lat, o_lon, o_snap_lat, o_snap_lon) > max_snap_m:
        return None
    if haversine_m(d_lat, d_lon, d_snap_lat, d_snap_lon) > max_snap_m:
        return None

    H = G.copy()
    for u, v, k, data in H.edges(keys=True, data=True):
        u_lat, u_lon = _node_latlon(H, u)
        v_lat, v_lon = _node_latlon(H, v)
        if _edge_blocked_by_hazards(u_lat, u_lon, v_lat, v_lon, hard):
            data["travel_cost"] = 1e18
            continue
        length_m = float(data.get("length")) if data.get("length") is not None else haversine_m(u_lat, u_lon, v_lat, v_lon)
        if length_m <= 0:
            length_m = haversine_m(u_lat, u_lon, v_lat, v_lon)
        mid_lat = 0.5 * (u_lat + v_lat)
        mid_lon = 0.5 * (u_lon + v_lon)
        hm = heat_value_at(mid_lat, mid_lon, heats) if heats else 0.0
        data["travel_cost"] = length_m * (1.0 + heat_penalty * hm)

    t_lat, t_lon = _node_latlon(H, dest)

    def heuristic(u: int, v: int) -> float:
        # v is the target node (NetworkX A* contract)
        la, lo = _node_latlon(H, u)
        return haversine_m(la, lo, t_lat, t_lon)

    try:
        nodes = nx.astar_path(H, orig, dest, heuristic=heuristic, weight="travel_cost")
    except nx.NetworkXNoPath:
        return None
    except Exception as e:
        logger.warning("astar_path failed: %s", e)
        return None

    return [_node_latlon(H, n) for n in nodes]
