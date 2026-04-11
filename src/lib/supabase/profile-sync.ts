import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AuthUser } from "@/lib/auth-storage";
import { DEFAULT_REPUTATION_SCORE } from "@/lib/auth-storage";
import { displayNameFromMetadata, supabaseUserToAuthUser } from "@/lib/supabase-user";

function stableUsername(user: User, displayName: string): string {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 20);
  const tail = user.id.replace(/-/g, "").slice(0, 12);
  return `${base || "user"}_${tail}`.slice(0, 60);
}

/**
 * Ensures a `profiles` row exists for the auth user and returns `AuthUser` with
 * reputation from the generated `profiles.reputation` column when available.
 */
export async function syncProfileFromAuthUser(
  client: SupabaseClient,
  user: User
): Promise<AuthUser> {
  const email = user.email ?? "";
  const name = displayNameFromMetadata(
    user.user_metadata as Record<string, unknown> | undefined,
    email
  );
  const username = stableUsername(user, name);

  const { error: upsertErr } = await client.from("profiles").upsert(
    {
      id: user.id,
      username,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (upsertErr) {
    console.warn("profiles upsert:", upsertErr.message);
  }

  const { data } = await client
    .from("profiles")
    .select("reputation, is_responder")
    .eq("id", user.id)
    .maybeSingle();

  const row = data as { reputation?: number; is_responder?: boolean } | null;
  const rep =
    row && typeof row.reputation === "number" && !Number.isNaN(row.reputation)
      ? row.reputation
      : DEFAULT_REPUTATION_SCORE;
  const isResponder =
    row && typeof row.is_responder === "boolean" ? row.is_responder : false;

  if (!row || typeof row.reputation !== "number") {
    return {
      ...supabaseUserToAuthUser(user),
      name,
      reputationScore: rep,
      over18Verified: true,
      isResponder,
    };
  }

  return {
    id: user.id,
    name,
    email,
    reputationScore: rep,
    over18Verified: true,
    isResponder,
  };
}
