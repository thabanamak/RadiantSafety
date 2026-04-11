export interface UserReport {
  id: string;
  latitude: number;
  longitude: number;
  /** Community trust = 10 + upvotes − downvotes (matches `user_reports.trust` in Supabase). */
  trustPoints: number;
  category: ReportCategory;
  description: string;
  /** Optional photo (data URL) from Quick Report. */
  imageDataUrl?: string | null;
  verifiedBy: number;
  upvotes: number;
  downvotes: number;
  createdAt: Date;
  userId: string;
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
  | "Gang Activity"
  | "Unsafe Vibe"
  | "Poor Lighting"
  | "Theft"
  | "Harassment"
  | "Suspicious Activity"
  | "Vandalism"
  | "Drug Activity";

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
