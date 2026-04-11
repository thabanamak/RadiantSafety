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

export type ProfileVoteSide = "up" | "down";

/**
 * Current user's vote on a profile (`profile_votes.side`), if any.
 */
export async function fetchMyProfileVote(
  client: SupabaseClient,
  profileId: string
): Promise<ProfileVoteSide | null> {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user?.id) return null;

  const { data, error } = await client
    .from("profile_votes")
    .select("side")
    .eq("profile_id", profileId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[RadiantSafety] fetch profile_votes:", error.message);
    return null;
  }
  const row = data as { side?: unknown } | null;
  const side = row?.side;
  return side === "up" || side === "down" ? side : null;
}

/**
 * Toggle approve/disapprove on another user's profile (`vote_profile` RPC).
 */
export async function voteProfile(
  client: SupabaseClient,
  profileId: string,
  direction: "up" | "down"
): Promise<
  | {
      ok: true;
      upvotes: number;
      downvotes: number;
      reputation: number;
      myVote: ProfileVoteSide | null;
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
    my_vote?: unknown;
  } | null;

  const n = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    }
    return null;
  };

  const upvotes = n(row?.upvotes);
  const downvotes = n(row?.downvotes);
  const reputation = n(row?.reputation);
  if (upvotes === null || downvotes === null || reputation === null) {
    return { ok: false, error: "Unexpected response from vote_profile" };
  }

  const mv = row?.my_vote;
  const myVote: ProfileVoteSide | null =
    mv === "up" || mv === "down" ? mv : null;
  return {
    ok: true,
    upvotes,
    downvotes,
    reputation,
    myVote,
  };
}
