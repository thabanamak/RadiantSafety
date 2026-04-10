export interface AuthUser {
  name: string;
  email: string;
  /** Persisted reputation score; new accounts start at 50. */
  reputationScore?: number;
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
      return { ...u, reputationScore: score };
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
