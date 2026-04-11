import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportCategory, UserReport } from "@/lib/types";
import { computeTrustPoints } from "@/lib/report-trust";

type UserReportRow = {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  description: string;
  category: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
  image_url: string | null;
};

function rowToUserReport(row: UserReportRow): UserReport {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    trustPoints: computeTrustPoints(row.upvotes, row.downvotes),
    category: row.category as ReportCategory,
    description: row.description,
    imageDataUrl: row.image_url ?? null,
    verifiedBy: 0,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    createdAt: new Date(row.created_at),
    userId: row.user_id,
  };
}

/** Merge DB rows with any in-memory-only rows (e.g. pending sync), deduped by id. */
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

/**
 * Load all community reports (RLS allows anon/authenticated read).
 * Order: newest first.
 */
export async function fetchUserReports(
  client: SupabaseClient,
  options?: { limit?: number }
): Promise<UserReport[]> {
  const limit = options?.limit ?? 200;
  const { data, error } = await client
    .from("user_reports")
    .select(
      "id, user_id, latitude, longitude, description, category, upvotes, downvotes, created_at, image_url"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[RadiantSafety] fetch user_reports:", error.message);
    return [];
  }
  if (!data?.length) return [];
  return (data as UserReportRow[]).map(rowToUserReport);
}

export type InsertUserReportInput = {
  category: ReportCategory;
  description: string;
  latitude: number;
  longitude: number;
  /** Public URL after uploading to Storage; omit for no photo. */
  imageUrl?: string | null;
};

/**
 * Inserts a row into `public.user_reports`. Requires an authenticated Supabase session (RLS).
 * Returns the new row `id`, or `null` with `error` on failure / no session.
 */
export async function insertUserReport(
  client: SupabaseClient,
  input: InsertUserReportInput
): Promise<{ id: string } | { id: null; error: string }> {
  // Prefer getUser() so JWT is validated; getSession() can be stale across rapid inserts.
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user?.id) {
    return { id: null, error: authError?.message ?? "Not signed in" };
  }

  const { data, error } = await client
    .from("user_reports")
    .insert({
      user_id: user.id,
      latitude: input.latitude,
      longitude: input.longitude,
      description: input.description.trim() || "(No description)",
      category: input.category,
      image_url: input.imageUrl ?? null,
    })
    .select("id");

  if (error) {
    return { id: null, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const newId =
    row && typeof row === "object" && row !== null && "id" in row
      ? String((row as { id: string }).id)
      : null;
  if (!newId) {
    return { id: null, error: "No id returned" };
  }
  return { id: newId };
}
