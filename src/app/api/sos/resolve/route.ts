import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      alert_id?: string;
      user_id?: string;
      description?: string;
      photo_url?: string;
    };

    const { alert_id, user_id, description, photo_url } = body;

    if (!alert_id || !user_id) {
      return NextResponse.json({ error: "alert_id and user_id are required" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    // Only the original sender can resolve their own alert
    const { data, error } = await supabase
      .from("sos_alerts")
      .update({
        resolved_at: new Date().toISOString(),
        resolved_description: description ?? null,
        resolved_photo_url: photo_url ?? null,
      })
      .eq("id", alert_id)
      .eq("user_id", user_id)
      .select("id")
      .single();

    if (error || !data) {
      console.error("[sos/resolve] update error:", error?.message);
      return NextResponse.json(
        { error: error?.message ?? "Alert not found or not authorised" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
