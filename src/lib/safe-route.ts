export type SafeRouteLineFeature = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: {
    distance_meters: number;
    duration_seconds: number;
    mean_heat: number;
    peak_heat: number;
  };
};

export type SafeRouteIncident = {
  latitude: number;
  longitude: number;
  intensity: number;
  influence_meters: number;
};

export type SafeRouteRequest = {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  incident_points: SafeRouteIncident[];
  /** Mapbox Directions travel mode — geometry follows Mapbox road/path network. */
  mapbox_profile?: "walking" | "cycling" | "driving";
  heat_penalty?: number;
  grid_resolution_meters?: number;
  padding_meters?: number;
};

export type SafeRouteResponse = {
  waypoints: { latitude: number; longitude: number }[];
  distance_meters: number;
  duration_seconds: number;
  algorithm: string;
  hard_zones: number;
  mean_heat: number;
  peak_heat: number;
};

/** Keeps POST body small; backend only uses incidents near the route corridor anyway. */
const MAX_INCIDENTS = 120;

/** Downsample if the API would be too heavy for the Python grid. */
export function capIncidents<T extends { latitude: number; longitude: number }>(
  items: T[],
  max = MAX_INCIDENTS
): T[] {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  return items.filter((_, i) => i % step === 0).slice(0, max);
}

export function responseToLineFeature(res: SafeRouteResponse): SafeRouteLineFeature {
  const coordinates = res.waypoints.map((w) => [w.longitude, w.latitude] as [number, number]);
  return {
    type: "Feature",
    properties: {
      distance_meters: res.distance_meters,
      duration_seconds: res.duration_seconds ?? 0,
      mean_heat: res.mean_heat,
      peak_heat: res.peak_heat,
    },
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}
