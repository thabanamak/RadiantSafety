import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportCategory, UserReport } from "@/lib/types";
import { computeTrustPoints } from "@/lib/report-trust";

export type InsertUserReportInput = {
  category: ReportCategory;
  description: string;
  latitude: number;
  longitude: number;
  /** Public URL after uploading to Storage; omit for no photo. */
  imageUrl?: string | null;
};

type UserReportRow = {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  description: string;
  image_url: string | null;
  category: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
  /** Generated column when selected from DB. */
  trust?: number | null;
  trust_label?: string | null;
};

function isReportCategory(c: string): c is ReportCategory {
  return (
    [
      "Physical Altercation",
      "Harassment",
      "Theft / Robbery",
      "Public Disturbance",
      "Suspicious Behavior",
      "Substance Use",
      "Property Damage",
      "Environmental Hazard",
    ] as const
  ).includes(c as ReportCategory);
}

/** Public handle when we cannot read other users’ profiles under RLS (see profiles policies). */
function reporterDisplayName(
  userId: string,
  self: { id: string; name: string } | null | undefined
): string {
  if (self && self.id === userId && self.name?.trim()) {
    return self.name.trim();
  }
  return `User ${userId.replace(/-/g, "").slice(0, 6)}`;
}

function rowToUserReport(
  row: UserReportRow,
  self: { id: string; name: string } | null | undefined,
  myVote: "up" | "down" | null | undefined
): UserReport {
  const cat = isReportCategory(row.category) ? row.category : "Suspicious Behavior";
  const trustPoints =
    typeof row.trust === "number" && Number.isFinite(row.trust)
      ? row.trust
      : computeTrustPoints(row.upvotes, row.downvotes);
  const trustLabel =
    typeof row.trust_label === "string" && row.trust_label.trim() !== ""
      ? row.trust_label
      : null;
  const uid = row.user_id;
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    trustPoints,
    trustLabel,
    myVote: myVote ?? null,
    category: cat,
    description: row.description,
    imageDataUrl: row.image_url,
    verifiedBy: 0,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    createdAt: new Date(row.created_at),
    userId: uid,
    reporterId: uid,
    reporterDisplayName: reporterDisplayName(uid, self),
  };
}

/**
 * Current user’s vote rows for the given report ids (`user_report_votes`).
 */
export async function fetchMyReportVotes(
  client: SupabaseClient,
  reportIds: string[]
): Promise<Record<string, "up" | "down">> {
  if (reportIds.length === 0) return {};
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user?.id) return {};

  const { data, error } = await client
    .from("user_report_votes")
    .select("report_id, side")
    .eq("user_id", user.id)
    .in("report_id", reportIds);

  if (error || !data?.length) {
    if (error) console.warn("[RadiantSafety] fetch user_report_votes:", error.message);
    return {};
  }
  const out: Record<string, "up" | "down"> = {};
  for (const row of data as { report_id: string; side: string }[]) {
    if (row.side === "up" || row.side === "down") out[row.report_id] = row.side;
  }
  return out;
}

/** Merge DB rows with any in-memory-only rows (e.g. pending insert), deduped by id. */
export function mergeUserReports(fromDb: UserReport[], local: UserReport[]): UserReport[] {
  const map = new Map<string, UserReport>();
  for (const r of fromDb) map.set(r.id, r);
  for (const r of local) {
    if (!map.has(r.id)) map.set(r.id, r);
  }
  return [...map.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

const FETCH_LIMIT = 300;

/**
 * Load community reports from `public.user_reports` (anon/authenticated read per RLS).
 */
export async function fetchUserReports(
  client: SupabaseClient,
  options?: {
    /** Current user — used only to show your display name on your rows. */
    self?: { id: string; name: string } | null;
    limit?: number;
  }
): Promise<UserReport[]> {
  const limit = options?.limit ?? FETCH_LIMIT;
  const self = options?.self;
  const { data, error } = await client
    .from("user_reports")
    .select(
      "id, user_id, latitude, longitude, description, image_url, category, upvotes, downvotes, created_at, trust, trust_label"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[RadiantSafety] fetch user_reports:", error.message);
    return [];
  }
  if (!data?.length) return [];
  const rows = data as UserReportRow[];
  const ids = rows.map((r) => r.id);
  const votes =
    self?.id && ids.length > 0 ? await fetchMyReportVotes(client, ids) : {};
  return rows.map((row) =>
    rowToUserReport(row, self, votes[row.id] ?? null)
  );
}

/**
 * Delete own row (RLS). Returns ok false if not signed in or delete denied.
 */
export async function deleteUserReport(
  client: SupabaseClient,
  reportId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user?.id) {
    return { ok: false, error: "Not signed in" };
  }
  const { error } = await client.from("user_reports").delete().eq("id", reportId);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Toggle / switch vote via `toggle_user_report_vote` (see scripts/user-reports-toggle-votes.sql).
 * Same-side click removes the vote; opposite side switches.
 */
export async function toggleUserReportVote(
  client: SupabaseClient,
  reportId: string,
  side: "up" | "down"
): Promise<
  | {
      ok: true;
      upvotes: number;
      downvotes: number;
      trust: number;
      trustLabel: string;
      myVote: "up" | "down" | null;
    }
  | { ok: false; error: string }
> {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user?.id) {
    return { ok: false, error: "Not signed in" };
  }

  const { data, error } = await client.rpc("toggle_user_report_vote", {
    p_report_id: reportId,
    p_side: side,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data as {
    upvotes?: unknown;
    downvotes?: unknown;
    trust?: unknown;
    trust_label?: unknown;
    my_vote?: unknown;
  } | null;
  const up = row?.upvotes;
  const down = row?.downvotes;
  const trust = row?.trust;
  const trustLabel = row?.trust_label;
  const mv = row?.my_vote;
  if (
    typeof up !== "number" ||
    typeof down !== "number" ||
    typeof trust !== "number" ||
    typeof trustLabel !== "string"
  ) {
    return { ok: false, error: "Unexpected response from toggle_user_report_vote" };
  }
  const myVote = mv === "up" || mv === "down" ? mv : null;
  return {
    ok: true,
    upvotes: up,
    downvotes: down,
    trust,
    trustLabel,
    myVote,
  };
}

/**
 * Inserts a row into `public.user_reports`. Requires an authenticated Supabase session (RLS).
 * Returns the new row `id`, or `null` with `error` on failure / no session.
 */
export async function insertUserReport(
  client: SupabaseClient,
  input: InsertUserReportInput
): Promise<{ id: string } | { id: null; error: string }> {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session?.user?.id) {
    return { id: null, error: "Not signed in" };
  }

  const { data, error } = await client
    .from("user_reports")
    .insert({
      user_id: session.user.id,
      latitude: input.latitude,
      longitude: input.longitude,
      description: input.description.trim() || "(No description)",
      category: input.category,
      image_url: input.imageUrl ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return { id: null, error: error.message };
  }
  if (!data?.id) {
    return { id: null, error: "No id returned" };
  }
  return { id: data.id as string };
}
