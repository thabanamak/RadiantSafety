/**
 * Clears public.profiles on your Supabase project.
 * Uses SUPABASE_URL + SUPABASE_SERVICE_KEY from .env.local.
 *
 * Run: node scripts/clear-profiles-and-past-reports.mjs
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");

function loadEnvLocal() {
  if (!existsSync(envPath)) {
    console.error("Missing .env.local (need SUPABASE_URL and SUPABASE_SERVICE_KEY)");
    process.exit(1);
  }
  const raw = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnvLocal();
const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
  /\/$/,
  ""
);
const serviceKey = env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local");
  process.exit(1);
}

const client = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const epoch = "1970-01-01T00:00:00.000Z";

const { error } = await client.from("profiles").delete().gte("created_at", epoch);

if (error) {
  console.error("profiles:", error.message);
  process.exit(1);
}

console.log("Cleared profiles on", url);
