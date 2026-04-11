import { astarSafeRoute, incidentToHeatSource, type AStarOptions } from "@/lib/astar-engine";
import type { SafeRouteIncident } from "@/lib/safe-route";

export interface ClientSafeRouteResult {
  path: [number, number][];
  /** True if any segment of the path passes through a non-zero heat zone.
   *  Frontend uses this to trigger a Safe Walk / Active Monitoring prompt. */
  entersHazardZone: boolean;
  /** Per-point heat along `path` (for street-snap apex / corridor choice). */
  pathHeats: number[];
}

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
  incidents: SafeRouteIncident[] | undefined,
  options?: AStarOptions,
): ClientSafeRouteResult | null {
  const start: [number, number] = [origin.longitude, origin.latitude];
  const end: [number, number] = [destination.longitude, destination.latitude];
  const heat = (incidents ?? []).map(incidentToHeatSource);
  const res = astarSafeRoute(start, end, heat, [], {
    heatPenalty: 40,
    resolutionM: 60,
    ...options,
  });
  if (!res || res.path.length < 2) return null;
  return { path: res.path, entersHazardZone: res.entersHazardZone, pathHeats: res.pathHeats };
}

export type SafeRouteEngineMode = "server" | "client" | "hybrid";

export function readSafeRouteEngineMode(): SafeRouteEngineMode {
  const v = (process.env.NEXT_PUBLIC_SAFE_ROUTE_ENGINE ?? "hybrid").toLowerCase();
  if (v === "client" || v === "server") return v;
  return "hybrid"; // default — browser A* first, then upgrade with Python backend if available
}
