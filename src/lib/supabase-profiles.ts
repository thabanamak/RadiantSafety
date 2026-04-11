import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicProfileRow = {
  id: string;
  username: string;
  upvotes: number;
  downvotes: number;
  reputation: number;
};

/**
 * Read a single profile row (requires policies in scripts/profiles-public-read-and-vote-rpc.sql).
 */
export async function fetchPublicProfile(
  client: SupabaseClient,
  userId: string
): Promise<PublicProfileRow | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id, username, upvotes, downvotes, reputation")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[RadiantSafety] fetch profiles:", error.message);
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const id = row.id;
  const username = row.username;
  const upvotes = row.upvotes;
  const downvotes = row.downvotes;
  const reputation = row.reputation;
  if (
    typeof id !== "string" ||
    typeof username !== "string" ||
    typeof upvotes !== "number" ||
    typeof downvotes !== "number" ||
    typeof reputation !== "number"
  ) {
    return null;
  }
  return { id, username, upvotes, downvotes, reputation };
}

/**
 * Vote another user's profile (see `vote_profile` RPC).
 */
export async function voteProfile(
  client: SupabaseClient,
  profileId: string,
  direction: "up" | "down"
): Promise<
  | { ok: true; upvotes: number; downvotes: number; reputation: number }
  | { ok: false; error: string }
> {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user?.id) {
    return { ok: false, error: "Not signed in" };
  }

  const { data, error } = await client.rpc("vote_profile", {
    p_profile_id: profileId,
    p_direction: direction,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data as {
    upvotes?: unknown;
    downvotes?: unknown;
    reputation?: unknown;
  } | null;
  if (
    typeof row?.upvotes !== "number" ||
    typeof row?.downvotes !== "number" ||
    typeof row?.reputation !== "number"
  ) {
    return { ok: false, error: "Unexpected response from vote_profile" };
  }
  return {
    ok: true,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    reputation: row.reputation,
  };
}
