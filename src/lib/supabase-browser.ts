import { createClient } from "@supabase/supabase-js";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Browser-safe Supabase client using the public anon key.
 * Used for Realtime subscriptions and client-side reads.
 * Never import this in API routes — use src/lib/supabase.ts (service key) there.
 */
export const supabaseBrowser = createClient(url, key);
