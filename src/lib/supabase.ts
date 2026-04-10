import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase env vars (SUPABASE_URL / SUPABASE_SERVICE_KEY)");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
