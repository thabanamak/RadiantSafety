import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportCategory } from "@/lib/types";

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
