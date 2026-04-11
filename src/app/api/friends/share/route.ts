import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      room_code?: string;
      device_id?: string;
      display_name?: string;
      lat?: number;
      lng?: number;
    };

    const { room_code, device_id, display_name, lat, lng } = body;

    if (!room_code || !device_id || typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json(
        { error: "room_code, device_id, lat and lng are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const { error } = await supabase.from("friend_locations").upsert(
      {
        room_code: room_code.toUpperCase(),
        device_id,
        display_name: display_name?.trim() || "Friend",
        lat,
        lng,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "room_code,device_id" }
    );

    if (error) {
      console.error("[friends/share] upsert error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
