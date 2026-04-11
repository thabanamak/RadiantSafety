/** Community trust points: same formula as DB `user_reports.trust`. */
export function computeTrustPoints(upvotes: number, downvotes: number): number {
  return 10 + upvotes - downvotes;
}

export type TrustDisplayKind =
  | "untrustworthy"
  | "medium_trust"
  | "semi_trustworthy"
  | "trustworthy";

/**
 * Labels for UI (matches SQL `trust_label` semantics).
 * trust < 0 should not appear in UI — DB deletes those rows.
 */
export function getTrustDisplayKind(trustPoints: number): TrustDisplayKind {
  if (trustPoints >= 20) return "trustworthy";
  if (trustPoints >= 15) return "semi_trustworthy";
  if (trustPoints >= 6) return "medium_trust";
  return "untrustworthy";
}

export function getTrustDisplayText(trustPoints: number): string {
  const k = getTrustDisplayKind(trustPoints);
  if (k === "trustworthy") return "Trustworthy";
  if (k === "semi_trustworthy") return "Semi-trustworthy";
  if (k === "medium_trust") return "Medium trust";
  return "Untrustworthy";
}
