import { astarSafeRoute, incidentToHeatSource, type AStarOptions } from "@/lib/astar-engine";
import type { SafeRouteIncident } from "@/lib/safe-route";

/**
 * Run the browser-side A* grid engine (see `astar-engine.ts`).
 *
 * Enable from `.env.local`:
 *   NEXT_PUBLIC_SAFE_ROUTE_ENGINE=client
 * or try client first, then your FastAPI proxy:
 *   NEXT_PUBLIC_SAFE_ROUTE_ENGINE=hybrid
 *
 * Default (omit or `server`) uses only `/api/safe-route`.
 *
 * Important: `client` / `hybrid` browser paths are grid A* — they do NOT follow OSM
 * sidewalks; use server mode + running FastAPI for real footpaths / Mapbox walking.
 */
export function computeClientSafeRoute(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  incidents: SafeRouteIncident[],
  options?: AStarOptions,
): [number, number][] | null {
  const start: [number, number] = [origin.longitude, origin.latitude];
  const end: [number, number] = [destination.longitude, destination.latitude];
  const heat = incidents.map(incidentToHeatSource);
  const res = astarSafeRoute(start, end, heat, [], {
    heatPenalty: 14,
    resolutionM: 80,
    ...options,
  });
  if (!res || res.path.length < 2) return null;
  return res.path;
}

export type SafeRouteEngineMode = "server" | "client" | "hybrid";

export function readSafeRouteEngineMode(): SafeRouteEngineMode {
  const v = (process.env.NEXT_PUBLIC_SAFE_ROUTE_ENGINE ?? "hybrid").toLowerCase();
  if (v === "client" || v === "server") return v;
  return "hybrid"; // default — browser A* first, then upgrade with Python backend if available
}
