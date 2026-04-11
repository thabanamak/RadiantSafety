export interface UserReport {
  id: string;
  latitude: number;
  longitude: number;
  /** Community trust score (= `user_reports.trust` when loaded from DB). */
  trustPoints: number;
  /** `user_reports.trust_label` from Supabase when available. */
  trustLabel?: string | null;
  /** Current user’s vote on this report, if signed in (`user_report_votes.side`). */
  myVote?: "up" | "down" | null;
  category: ReportCategory;
  description: string;
  /** Optional photo (data URL) from Quick Report. */
  imageDataUrl?: string | null;
  verifiedBy: number;
  upvotes: number;
  downvotes: number;
  createdAt: Date;
  /** @deprecated Use reporterId — kept for older mock data */
  userId: string;
  /** Account id of reporter (matches AuthUser.id). */
  reporterId: string;
  reporterDisplayName: string;
}

/** Map + heatmap: intensity 1–10; optional trustPoints for community trust label. */
export type MapIncidentPoint = {
  id: string;
  latitude: number;
  longitude: number;
  category: ReportCategory;
  intensity: number;
  /** Set for user-submitted reports (10 + up − down). */
  trustPoints?: number;
};

export type ReportCategory =
  | "Physical Altercation"
  | "Harassment"
  | "Theft / Robbery"
  | "Public Disturbance"
  | "Suspicious Behavior"
  | "Substance Use"
  | "Property Damage"
  | "Environmental Hazard";

export interface UserReputation {
  score: number;
  label: string;
  isTrusted: boolean;
}

export interface IncidentFeedItem {
  id: string;
  category: ReportCategory;
  verifiedBy: number;
  upvotes: number;
  downvotes: number;
  createdAt: Date;
  latitude: number;
  longitude: number;
}
