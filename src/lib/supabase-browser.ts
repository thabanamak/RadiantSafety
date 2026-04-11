import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

function readBrowserEnv() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return { url, key };
}

export function isSupabaseBrowserConfigured(): boolean {
  const { url, key } = readBrowserEnv();
  return Boolean(url && key);
}

/**
 * Browser Supabase client (anon key), or null if public env is not set.
 * Avoids crashing the app when SOS / Find My / storage are used without Supabase configured.
 */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (cached) return cached;

  const { url, key } = readBrowserEnv();
  if (!url || !key) return null;

  cached = createClient(url, key);
  return cached;
}
