import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

function isMissingSchemaColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("column") ||
    m.includes("schema cache") ||
    m.includes("does not exist")
  );
}

/**
 * Verified responder accepts a pending SOS (handshake).
 * Sets status = accepted and responder_id = auth user id.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      alert_id?: string;
      access_token?: string;
    };

    const { alert_id, access_token } = body;

    if (!alert_id || !access_token) {
      return NextResponse.json(
        { error: "alert_id and access_token are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }

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
      console.error("[sos/accept] profile read:", profileErr.message);
      return NextResponse.json({ error: "Could not verify responder status" }, { status: 500 });
    }
    const row = profile as { is_responder?: boolean } | null;
    if (!row?.is_responder) {
      return NextResponse.json(
        { error: "Only verified responders can accept an SOS" },
        { status: 403 }
      );
    }

    // Allow repeat accepts while unresolved (pending or accepted) so another responder
    // can take the task or you can re-accept for testing; last accepter becomes responder_id.
    let { data: updated, error: updErr } = await supabase
      .from("sos_alerts")
      .update({
        status: "accepted",
        responder_id: user.id,
      })
      .eq("id", alert_id)
      .in("status", ["pending", "accepted"])
      .is("resolved_at", null)
      .select("id, status, responder_id")
      .maybeSingle();

    if (updErr && isMissingSchemaColumnError(updErr.message)) {
      ({ data: updated, error: updErr } = await supabase
        .from("sos_alerts")
        .update({ status: "accepted" })
        .eq("id", alert_id)
        .in("status", ["pending", "accepted"])
        .is("resolved_at", null)
        .select("id, status")
        .maybeSingle());
    }

    if (updErr && isMissingSchemaColumnError(updErr.message)) {
      return NextResponse.json(
        {
          error:
            "SOS handshake columns are missing on sos_alerts. Run scripts/sos-alerts-responder-handshake.sql in the Supabase SQL editor, then reload the schema (or wait a minute for the schema cache).",
        },
        { status: 503 }
      );
    }

    if (updErr) {
      console.error("[sos/accept] update:", updErr.message);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json(
        { error: "This SOS is no longer available or has already been resolved" },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, alert: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
