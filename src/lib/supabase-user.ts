import type { User } from "@supabase/supabase-js";
import type { AuthUser } from "@/lib/auth-storage";
import { DEFAULT_REPUTATION_SCORE } from "@/lib/auth-storage";

export function displayNameFromMetadata(
  meta: Record<string, unknown> | undefined,
  email: string
): string {
  const full = meta?.full_name;
  const display = meta?.display_name;
  if (typeof full === "string" && full.trim()) return full.trim();
  if (typeof display === "string" && display.trim()) return display.trim();
  return email.split("@")[0] || "User";
}

export function isEmailConfirmed(user: User | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at);
}

/** Fallback only — prefer `syncProfileFromAuthUser` so name/reputation come from `profiles`. */
export function supabaseUserToAuthUser(user: User): AuthUser {
  const email = user.email ?? "";
  return {
    id: user.id,
    name: displayNameFromMetadata(
      user.user_metadata as Record<string, unknown> | undefined,
      email
    ),
    email,
    reputationScore: DEFAULT_REPUTATION_SCORE,
  };
}
