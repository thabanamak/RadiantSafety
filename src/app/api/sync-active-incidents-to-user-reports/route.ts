import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabase";
import { categoryFromIncidentIntensity } from "@/lib/incident-intensity-category";

/** Cap rows per request to avoid huge POST bodies / timeouts. */
const MAX_TOTAL = 12_000;
const CHUNK = 400;

type VicPolIn = {
  id: string;
  title: string;
  latitude: number | null;
  longitude: number | null;
  intensity: number;
};

type SupabaseIn = {
  id: string;
  title: string;
  location_lat: number;
  location_lng: number;
  intensity: number;
};

type Body = {
  vicpol?: VicPolIn[];
  supabase?: SupabaseIn[];
};

export async function POST(request: Request) {
  const importUserId = process.env.SUPABASE_IMPORT_USER_ID?.trim();
  if (!importUserId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Set SUPABASE_IMPORT_USER_ID to a real auth.users UUID (e.g. a service/demo account) in your server env.",
        inserted: 0,
      },
      { status: 501 }
    );
  }

  const supabase = getSupabaseService();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Set SUPABASE_SERVICE_KEY (service_role secret from Supabase → Settings → API) in your server env (.env.local). The anon key cannot insert imported rows into user_reports because RLS only allows users to insert their own rows.",
        inserted: 0,
      },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON", inserted: 0 }, { status: 400 });
  }

  const vicpol = Array.isArray(body.vicpol) ? body.vicpol : [];
  const historical = Array.isArray(body.supabase) ? body.supabase : [];

  const rows: Array<{
    user_id: string;
    latitude: number;
    longitude: number;
    description: string;
    category: string;
    upvotes: number;
    downvotes: number;
    source_key: string;
  }> = [];

  for (const v of vicpol) {
    if (v.latitude == null || v.longitude == null) continue;
    const title = (v.title ?? "").trim() || "Victoria Police incident";
    rows.push({
      user_id: importUserId,
      latitude: v.latitude,
      longitude: v.longitude,
      description: title.slice(0, 8000),
      category: categoryFromIncidentIntensity(v.intensity),
      upvotes: 0,
      downvotes: 0,
      source_key: `vicpol:${v.id}`,
    });
  }

  for (const s of historical) {
    const title = (s.title ?? "").trim() || "Historical incident";
    rows.push({
      user_id: importUserId,
      latitude: s.location_lat,
      longitude: s.location_lng,
      description: title.slice(0, 8000),
      category: categoryFromIncidentIntensity(s.intensity),
      upvotes: 0,
      downvotes: 0,
      source_key: `historical:${s.id}`,
    });
  }

  const capped = rows.slice(0, MAX_TOTAL);
  let inserted = 0;
  let lastError: string | null = null;

  for (let i = 0; i < capped.length; i += CHUNK) {
    const chunk = capped.slice(i, i + CHUNK);
    const { error } = await supabase.from("user_reports").upsert(chunk, {
      onConflict: "source_key",
      ignoreDuplicates: false,
    });
    if (error) {
      lastError = error.message;
      break;
    }
    inserted += chunk.length;
  }

  if (lastError) {
    return NextResponse.json(
      {
        ok: false,
        error: lastError,
        inserted,
        total: capped.length,
        note:
          "If this mentions source_key, run scripts/user-reports-add-source-key.sql in Supabase.",
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    inserted,
    total: capped.length,
    truncated: rows.length > MAX_TOTAL,
  });
}

export const maxDuration = 300;
