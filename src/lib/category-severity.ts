import type { ReportCategory } from "@/lib/types";

/**
 * Severity 1–10 for heatmap intensity (matches VicPol / AreaIncidentSummary bands).
 * Must stay in sync with `scripts/user-reports-table.sql` generated `severity` column.
 */
const SEVERITY: Record<ReportCategory, number> = {
  "Physical Altercation": 10,
  "Harassment": 9,
  "Environmental Hazard": 8,
  "Substance Use": 8,
  "Public Disturbance": 7,
  "Theft / Robbery": 7,
  "Property Damage": 6,
  "Suspicious Behavior": 5,
};

export function getSeverityForCategory(category: ReportCategory): number {
  return SEVERITY[category] ?? 5;
}
