/** CSS diameter for map HTML markers; grows with Mapbox zoom (~7–22). */
export function zoomScaledMarkerDiameterPx(zoom: number): number {
  const z = Math.max(7, Math.min(22, zoom));
  const t = (z - 7) / 15;
  return Math.round(14 + t * 46);
}
