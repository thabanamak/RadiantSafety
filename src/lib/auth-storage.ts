/**
 * Supabase-backed session user shape (profiles + auth). Used by profile sync and related code.
 * UI components may use a narrower `{ name, email }` from TopNav.
 */
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  reputationScore: number;
};

/** Default reputation when no profile row exists yet (aligns with DB seed / profile logic). */
export const DEFAULT_REPUTATION_SCORE = 50;
