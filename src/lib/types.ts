export interface UserReport {
  id: string;
  latitude: number;
  longitude: number;
  trustScore: number;
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

export type MapIncidentPoint = Pick<
  UserReport,
  "id" | "latitude" | "longitude" | "trustScore" | "category"
>;

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
