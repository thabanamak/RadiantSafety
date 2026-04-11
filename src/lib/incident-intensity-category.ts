import type { ReportCategory } from "@/lib/types";
import { getSeverityForCategory } from "@/lib/category-severity";

const ALL: ReportCategory[] = [
  "Gang Activity",
  "Unsafe Vibe",
  "Poor Lighting",
  "Theft",
  "Harassment",
  "Suspicious Activity",
  "Vandalism",
  "Drug Activity",
];

/** Map VicPol/historical intensity (1–10) to the closest report category by severity. */
export function categoryFromIncidentIntensity(intensity: number): ReportCategory {
  const t = Math.max(1, Math.min(10, Math.round(Number(intensity)) || 5));
  let best: ReportCategory = "Suspicious Activity";
  let bestDiff = 99;
  for (const c of ALL) {
    const d = Math.abs(getSeverityForCategory(c) - t);
    if (d < bestDiff) {
      bestDiff = d;
      best = c;
    }
  }
  return best;
}
