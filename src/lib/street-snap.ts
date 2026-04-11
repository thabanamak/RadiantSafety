/**
 * Street-snap pipeline: takes a raw A* coordinate array and snaps it to
 * the real walking network via the Mapbox Directions API.
 *
 * Usage:
 *   const snapped = await snapRouteToStreets(rawAStarCoords);
 *   if (snapped) setSafeRouteData(snapped);
 *   // else fall back to raw coords already displayed
 */

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

/**
 * Snap a raw A* path to the real walking network via the Mapbox Directions API.
 *
 * Only the start and end of the A* path are passed to Mapbox.
 * Injecting intermediate grid waypoints forces Mapbox to visit arbitrary
 * 80 m grid cells in sequence, producing L-shape / staircase artefacts.
 * Mapbox already finds the optimal street-following path between two points
 * on its own — intermediate waypoints only help if we know exact street-level
 * detour coordinates, which the grid A* does not provide.
 *
 * Returns `null` on any failure so callers can fall back to the raw A* path.
 */
export async function snapRouteToStreets(
  rawCoords: [number, number][],
): Promise<[number, number][] | null> {
  if (!MAPBOX_TOKEN || rawCoords.length < 2) return null;

  const origin = rawCoords[0];
  const dest = rawCoords[rawCoords.length - 1];
  const coordStr = `${origin[0]},${origin[1]};${dest[0]},${dest[1]}`;
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

    return data.routes[0].geometry.coordinates;
  } catch {
    return null;
  }
}
