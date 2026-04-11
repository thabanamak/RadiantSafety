import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      user_id?: string;
      lat?: number;
      lng?: number;
      mode?: string;
    };

    const { user_id, lat, lng, mode = "passive" } = body;

    if (!user_id || typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "user_id, lat and lng are required" }, { status: 400 });
    }

    if (!["passive", "active_guardian"].includes(mode)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    const { error } = await supabase.from("user_pulse").upsert(
      {
        user_id,
        last_seen: new Date().toISOString(),
        // WKT point — PostGIS geography expects (longitude latitude)
        location: `POINT(${lng} ${lat})`,
        mode,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("[pulse] upsert error:", error.message);
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
