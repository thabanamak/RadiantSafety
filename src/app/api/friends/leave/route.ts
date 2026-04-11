import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      room_code?: string;
      device_id?: string;
    };

    const { room_code, device_id } = body;

    if (!room_code || !device_id) {
      return NextResponse.json(
        { error: "room_code and device_id are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const { error } = await supabase
      .from("friend_locations")
      .delete()
      .match({ room_code: room_code.toUpperCase(), device_id });

    if (error) {
      console.error("[friends/leave] delete error:", error.message);
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
