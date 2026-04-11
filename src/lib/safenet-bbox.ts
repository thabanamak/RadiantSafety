/**
 * Greater Melbourne service area for RadiantSafety routing (SafeNet).
 * Order: west, south, east, north in degrees (WGS84).
 */
export const SAFENET_MELBOURNE = {
  minLng: 144.333,
  minLat: -38.5,
  maxLng: 145.5,
  maxLat: -37.5,
} as const;

export function isWithinSafenetCoverage(lng: number, lat: number): boolean {
  return (
    lng >= SAFENET_MELBOURNE.minLng &&
    lng <= SAFENET_MELBOURNE.maxLng &&
    lat >= SAFENET_MELBOURNE.minLat &&
    lat <= SAFENET_MELBOURNE.maxLat
  );
}

export const SAFENET_COVERAGE_ERROR =
  "Location is outside current SafeNet coverage area.";

export const SAFENET_UNROUTABLE_ERROR =
  "Cannot calculate a safe route to this specific point. Please select a valid road or address.";
