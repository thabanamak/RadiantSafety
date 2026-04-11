import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Server-only Supabase client (service key or anon fallback).
 * Lazy — only reads env and throws when first used, so `next build` can succeed
 * on CI before env vars are present (routes still fail at runtime if unset).
 */
export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const supabaseUrl = (
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ""
  ).replace(/\/$/, "");

  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase env vars missing. Set SUPABASE_URL + SUPABASE_SERVICE_KEY (server) " +
        "or NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (client)."
    );
  }

  cached = createClient(supabaseUrl, supabaseKey);
  return cached;
}
