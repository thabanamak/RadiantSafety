import { createClient } from "@supabase/supabase-js";

// Server-side API routes use the full service key (never exposed to browser).
// Client-side code falls back to the NEXT_PUBLIC anon key.
const supabaseUrl = (
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  ""
).replace(/\/$/, ""); // strip trailing slash if present

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

export const supabase = createClient(supabaseUrl, supabaseKey);
