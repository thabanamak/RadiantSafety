import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/** PostgREST / Supabase when `status` or `responder_id` columns are not migrated yet */
function isMissingSchemaColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("column") ||
    m.includes("schema cache") ||
    m.includes("does not exist")
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      alert_id?: string;
      user_id?: string;
      description?: string;
      photo_url?: string;
      access_token?: string;
      as_first_responder?: boolean;
    };

    const { alert_id, user_id, description, photo_url, access_token, as_first_responder } = body;

    if (!alert_id) {
      return NextResponse.json({ error: "alert_id is required" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const basePayload = {
      resolved_at: new Date().toISOString(),
      resolved_description: description ?? null,
      resolved_photo_url: photo_url ?? null,
    };

    const fullPayload = { ...basePayload, status: "resolved" as const };

    if (as_first_responder && access_token) {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser(access_token);
      if (authErr || !user?.id) {
        return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
      }
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("is_responder")
        .eq("id", user.id)
        .maybeSingle();
      if (profileErr) {
        console.error("[sos/resolve] profile read:", profileErr.message);
        return NextResponse.json({ error: "Could not verify responder status" }, { status: 500 });
      }
      const row = profile as { is_responder?: boolean } | null;
      if (!row?.is_responder) {
        return NextResponse.json(
          { error: "Only verified first responders can resolve alerts for others" },
          { status: 403 }
        );
      }

      let { data, error } = await supabase
        .from("sos_alerts")
        .update(fullPayload)
        .eq("id", alert_id)
        .eq("status", "accepted")
        .eq("responder_id", user.id)
        .select("id")
        .maybeSingle();

      if (error) {
        if (!isMissingSchemaColumnError(error.message)) {
          console.error("[sos/resolve] responder update error:", error.message);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        ({ data, error } = await supabase
          .from("sos_alerts")
          .update(basePayload)
          .eq("id", alert_id)
          .select("id")
          .maybeSingle());
        if (error) {
          console.error("[sos/resolve] responder legacy update error:", error.message);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!data) {
          return NextResponse.json({ error: "Alert not found" }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
      }

      if (!data) {
        return NextResponse.json(
          { error: "Alert not found or you are not the assigned responder" },
          { status: 404 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (!user_id) {
      return NextResponse.json({ error: "alert_id and user_id are required" }, { status: 400 });
    }

    // Victim / device owner
    let { data, error } = await supabase
      .from("sos_alerts")
      .update(fullPayload)
      .eq("id", alert_id)
      .eq("user_id", user_id)
      .in("status", ["pending", "accepted"])
      .select("id")
      .maybeSingle();

    if (error && isMissingSchemaColumnError(error.message)) {
      ({ data, error } = await supabase
        .from("sos_alerts")
        .update(basePayload)
        .eq("id", alert_id)
        .eq("user_id", user_id)
        .select("id")
        .maybeSingle());
    }

    if (error) {
      console.error("[sos/resolve] victim update error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Alert not found or not authorised" },
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
