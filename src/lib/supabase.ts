import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readSupabaseEnv() {
  const supabaseUrl = (
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ""
  ).replace(/\/$/, "");

  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return { supabaseUrl, supabaseKey };
}

export function isSupabaseConfigured(): boolean {
  const { supabaseUrl, supabaseKey } = readSupabaseEnv();
  return Boolean(supabaseUrl && supabaseKey);
}

let client: SupabaseClient | null = null;

/** Server-side Supabase client; null when env is not set (avoids throwing at module load). */
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const { supabaseUrl, supabaseKey } = readSupabaseEnv();
  if (!supabaseUrl || !supabaseKey) return null;
  client = createClient(supabaseUrl, supabaseKey);
  return client;
}
