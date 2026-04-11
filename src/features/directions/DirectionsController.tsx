"use client";

/**
 * DirectionsController — Turn-by-turn directions feature
 *
 * Owner: friend (separate git branch: feature/directions)
 *
 * Responsibilities:
 *  - Accept an origin/destination and fetch a route from Mapbox Directions API
 *  - Expose the active route geometry to the map via onRouteChange
 *  - Render the Directions panel UI (search inputs, step-by-step list, ETA)
 *
 * This file is intentionally a stub. Build the feature here without touching
 * SOSController, FindMyController, or page.tsx internals beyond the props below.
 *
 * Map contract: pass your route as `activeRoute` to <RadiantMap> via page.tsx.
 * RadiantMap will render a sky-blue polyline from activeRoute.geometry automatically.
 */

interface ActiveRoute {
  geometry: GeoJSON.LineString;
}

interface DirectionsControllerProps {
  userCoords: { latitude: number; longitude: number } | null;
  /** Notify page so the map can render the route polyline. Pass null to clear. */
  onRouteChange: (route: ActiveRoute | null) => void;
}

export default function DirectionsController({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userCoords,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onRouteChange,
}: DirectionsControllerProps) {
  // TODO: implement Directions feature
  // Suggested steps:
  //  1. Add a destination search input (reuse SearchBar or a plain Mapbox geocoder)
  //  2. On destination select: GET https://api.mapbox.com/directions/v5/mapbox/walking/{origin};{destination}
  //  3. Parse response routes[0].geometry (GeoJSON LineString)
  //  4. Call onRouteChange({ geometry }) — map renders it immediately
  //  5. Render step-by-step maneuver list in a bottom sheet or side panel
  //  6. Call onRouteChange(null) when user dismisses directions

  return null;
}
