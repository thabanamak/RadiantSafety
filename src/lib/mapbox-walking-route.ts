const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

export interface WalkingRouteResult {
  geometry: GeoJSON.LineString;
  distanceMeters: number;
  durationSeconds: number;
}

/**
 * Fetch a walking route between two WGS84 points using Mapbox Directions API (client-side token).
 */
export async function fetchMapboxWalkingRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<WalkingRouteResult | null> {
  if (!MAPBOX_TOKEN) return null;
  const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}`
  );
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "false");
  url.searchParams.set("access_token", MAPBOX_TOKEN);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: Array<{
        geometry?: GeoJSON.LineString;
        distance?: number;
        duration?: number;
      }>;
    };
    const route = data.routes?.[0];
    if (!route?.geometry || route.geometry.type !== "LineString") return null;
    return {
      geometry: route.geometry,
      distanceMeters: route.distance ?? 0,
      durationSeconds: route.duration ?? 0,
    };
  } catch {
    return null;
  }
}
