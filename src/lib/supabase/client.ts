import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Browser Supabase client (anon key). Returns `{ client: null, error }` when env
 * is missing so callers can show a message instead of throwing during import/SSR.
 */
export function getSupabaseBrowserClient(): {
  client: SupabaseClient | null;
  error: string | null;
} {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!url || !key) {
    return {
      client: null,
      error:
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
    };
  }

  if (!cached) {
    cached = createClient(url, key);
  }
  return { client: cached, error: null };
}
