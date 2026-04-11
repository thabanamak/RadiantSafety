export interface AuthUser {
  /** Supabase `auth.users` id — matches `profiles.id`. */
  id?: string;
  name: string;
  email: string;
  /** Reputation from `profiles.reputation` (default 50). */
  reputationScore?: number;
  /**
   * When false, quick incident reports are blocked (local policy).
   * Supabase profile sync sets true for signed-in users.
   */
  over18Verified?: boolean;
}

export const DEFAULT_REPUTATION_SCORE = 50;

const STORAGE_KEY = "radiant-auth-user";

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "name" in parsed &&
      "email" in parsed &&
      typeof (parsed as AuthUser).name === "string" &&
      typeof (parsed as AuthUser).email === "string"
    ) {
      const u = parsed as AuthUser;
      const score =
        typeof u.reputationScore === "number" && !Number.isNaN(u.reputationScore)
          ? u.reputationScore
          : DEFAULT_REPUTATION_SCORE;
      const over18 =
        typeof u.over18Verified === "boolean" ? u.over18Verified : undefined;
      return { ...u, reputationScore: score, ...(over18 !== undefined ? { over18Verified: over18 } : {}) };
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearStoredUser(): void {
  localStorage.removeItem(STORAGE_KEY);
}
