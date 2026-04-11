import type { ReportCategory } from "@/lib/types";

/**
 * Severity 1–10 for heatmap intensity (matches VicPol / AreaIncidentSummary bands).
 * Must stay in sync with `scripts/user-reports-table.sql` generated `severity` column.
 */
const SEVERITY: Record<ReportCategory, number> = {
  "Gang Activity": 10,
  Harassment: 9,
  "Poor Lighting": 8,
  "Drug Activity": 8,
  "Unsafe Vibe": 7,
  Theft: 7,
  Vandalism: 6,
  "Suspicious Activity": 5,
};

export function getSeverityForCategory(category: ReportCategory): number {
  return SEVERITY[category] ?? 5;
}
