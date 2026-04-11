import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export interface SOSIncident {
  id: string;
  title: string;
  suburb: string;
  location_lat: number;
  location_lng: number;
  intensity: number;
  source: string;
  distance_meters: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      lat?: number;
      lng?: number;
      radius?: number;
    };

    const { lat, lng, radius = 1000 } = body;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("nearby_incidents", {
      lat,
      lng,
      radius_meters: Math.min(radius, 5000), // hard cap at 5 km
    });

    if (error) {
      console.error("[sos] nearby_incidents error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ incidents: (data ?? []) as SOSIncident[] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
