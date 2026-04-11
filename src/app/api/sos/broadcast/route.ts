import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      user_id?: string;
      lat?: number;
      lng?: number;
      issue?: string;
      description?: string;
      photo_url?: string;
    };

    const { user_id, lat, lng, issue, description, photo_url } = body;

    if (!user_id || typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "user_id, lat and lng are required" }, { status: 400 });
    }

    if (!["allergy", "medical", "cpr"].includes(issue ?? "")) {
      return NextResponse.json({ error: "Invalid issue type" }, { status: 400 });
    }

    const { error } = await getSupabase().from("sos_alerts").insert({
      user_id,
      issue,
      location: `POINT(${lng} ${lat})`,
      location_lat: lat,
      location_lng: lng,
      description: description ?? null,
      photo_url: photo_url ?? null,
    });

    if (error) {
      console.error("[sos/broadcast] insert error:", error.message);
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
