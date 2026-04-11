import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { syncFriendRoomMembers } from "@/lib/friend-locations-sync";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      room_code?: string;
      device_id?: string;
      /** Preferred column name */
      host_name?: string;
      /** @deprecated use host_name */
      display_name?: string;
      lat?: number;
      lng?: number;
    };

    const { room_code, device_id, lat, lng } = body;
    const hostName = (body.host_name ?? body.display_name)?.trim() || "Friend";

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

    const codeUpper = room_code.toUpperCase();
    const { data: beforeInRoom } = await supabase
      .from("friend_locations")
      .select("device_id")
      .eq("room_code", codeUpper);
    const isFirstInRoom = !beforeInRoom?.length;

    const { error } = await supabase.from("friend_locations").upsert(
      {
        room_code: codeUpper,
        device_id,
        host_name: hostName,
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

    const { error: syncErr } = await syncFriendRoomMembers(supabase, room_code, {
      roomCreatorDeviceId: isFirstInRoom ? device_id : undefined,
    });
    if (syncErr) {
      console.error("[friends/share] sync members error:", syncErr);
      return NextResponse.json({ error: syncErr }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
