import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export interface SupabaseIncident {
  id: string;
  title: string;
  suburb: string;
  location_lat: number;
  location_lng: number;
  intensity: number;
  source: string;
  is_verified: boolean;
}

export async function GET() {
  try {
    // Supabase/PostgREST commonly defaults to returning only the first 1000 rows.
    // Paginate until exhaustion so the heatmap can use the full dataset.
    const PAGE_SIZE = 1000;
    const items: SupabaseIncident[] = [];
    let offset = 0;

    // Safety cap (avoid runaway responses if the table grows huge).
    const MAX_ROWS = 20000;

    while (items.length < MAX_ROWS) {
      const { data, error } = await getSupabase()
        .from("incidents")
        .select("id, title, suburb, location_lat, location_lng, intensity, source, is_verified")
        .not("location_lat", "is", null)
        .not("location_lng", "is", null)
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error("Supabase incidents fetch error:", error.message);
        return NextResponse.json({ items: [], error: error.message });
      }

      const page = (data ?? []) as SupabaseIncident[];
      items.push(...page);

      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return NextResponse.json(
      { items, truncated: items.length >= 20000 },
      {
        headers: {
          // Cache for 10 minutes — historical data changes rarely
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=60",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      { items: [], error: e instanceof Error ? e.message : "Failed to fetch incidents" },
      { status: 200 }
    );
  }
}
