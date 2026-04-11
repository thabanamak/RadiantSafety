import type { FilterSpecification } from "mapbox-gl";

/** Heatmap layer on the `reports` GeoJSON source. */
export const CRIME_HEATMAP_LAYER_ID = "incidents-heat";

/** Circle layer for tap targets on the same source. */
export const CRIME_POINTS_LAYER_ID = "incidents-points";

export type IntensityFilter = "all" | "high" | "medium" | "low";

/**
 * Mapbox filter on feature property `intensity` (1–10).
 * `null` clears the filter (show all features).
 */
export function intensityFilterExpression(mode: IntensityFilter): FilterSpecification | null {
  if (mode === "all") return null;
  const i: ["get", "intensity"] = ["get", "intensity"];
  if (mode === "high") {
    return ["all", [">=", i, 8], ["<=", i, 10]] as FilterSpecification;
  }
  if (mode === "medium") {
    return ["all", [">=", i, 5], ["<=", i, 7]] as FilterSpecification;
  }
  return ["all", [">=", i, 1], ["<=", i, 4]] as FilterSpecification;
}
