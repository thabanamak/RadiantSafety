import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Browser Supabase client (anon key). Lazy so importing this module does not
 * call `createClient` during `next build` / SSR when env is not inlined yet.
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (cached) return cached;

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set."
    );
  }

  cached = createClient(url, key);
  return cached;
}
