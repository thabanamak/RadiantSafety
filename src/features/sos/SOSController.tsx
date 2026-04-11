"use client";

import { useState, useCallback, useEffect } from "react";
import { CheckCircle } from "lucide-react";
import SOSAreaPanel, { type SOSAlert } from "@/components/SOSAreaPanel";
import SOSIssueSheet, { type SOSIssueType } from "@/components/SOSIssueSheet";
import SOSResolveSheet from "@/components/SOSResolveSheet";
import SOSResponderHandshakeModal from "@/components/SOSResponderHandshakeModal";
import SOSVictimHandshakeBanner, {
  type VictimSosPhase,
} from "@/components/SOSVictimHandshakeBanner";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/identity";
import type { AuthUser } from "@/lib/auth-storage";

const VICTIM_SOS_KEY = "radiant_sos_victim_alert_id";

interface SOSControllerProps {
  userCoords: { latitude: number; longitude: number } | null;
  onFlyTo: (target: { latitude: number; longitude: number; zoom?: number }) => void;
  onAlertsChange: (alerts: SOSAlert[]) => void;
  /** Map alerts (keeps responder modal in sync with realtime). */
  sosMapAlerts: SOSAlert[];
  /** Called immediately when this device resolves an alert — for instant map cleanup */
  onAlertResolved?: (alertId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Controlled open state for the "SOS in the Area" side panel. */
  areaPanelOpen?: boolean;
  onAreaPanelOpenChange?: (open: boolean) => void;
  /** When true, this device receives nearby SOS realtime + map pings (verified first responder). */
  canReceiveSOSPings: boolean;
  authUser?: AuthUser | null;
  /** Mapbox + safe-route / client A* to the SOS coordinates */
  onRequestRouteToSosLocation?: (latitude: number, longitude: number) => void;
}

export default function SOSController({
  userCoords,
  onFlyTo,
  onAlertsChange,
  sosMapAlerts,
  onAlertResolved,
  open,
  onOpenChange,
  areaPanelOpen,
  onAreaPanelOpenChange,
  canReceiveSOSPings,
  authUser,
  onRequestRouteToSosLocation,
}: SOSControllerProps) {
  const [pruneSosId, setPruneSosId] = useState<string | null>(null);
  const clearPruneSos = useCallback(() => setPruneSosId(null), []);

  const [sosSubmitting, setSosSubmitting] = useState(false);
  const [resolveCtx, setResolveCtx] = useState<{
    alertId: string;
    mode: "victim" | "responder";
  } | null>(null);
  const [sosResolving, setSosResolving] = useState(false);

  const [victimHandoff, setVictimHandoff] = useState<{
    alertId: string;
    phase: VictimSosPhase;
  } | null>(null);

  const [responderModalAlert, setResponderModalAlert] = useState<SOSAlert | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  // Persists the accepted alert so responder can mark resolved after modal closes
  const [acceptedTask, setAcceptedTask] = useState<SOSAlert | null>(null);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(VICTIM_SOS_KEY) : null;
    if (!raw) return;
    setVictimHandoff({ alertId: raw, phase: "waiting" });
  }, []);

  useEffect(() => {
    const id = victimHandoff?.alertId;
    if (!id) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    void sb
      .from("sos_alerts")
      .select("status,resolved_at")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          localStorage.removeItem(VICTIM_SOS_KEY);
          setVictimHandoff(null);
          return;
        }
        const d = data as { status?: string; resolved_at?: string | null };
        if (d.resolved_at || d.status === "resolved") {
          localStorage.removeItem(VICTIM_SOS_KEY);
          setVictimHandoff(null);
        } else if (d.status === "accepted") {
          setVictimHandoff({ alertId: id, phase: "accepted" });
        }
      });
  }, [victimHandoff?.alertId]);

  useEffect(() => {
    const alertId = victimHandoff?.alertId;
    if (!alertId) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;

    const channel = sb
      .channel(`sos-victim-${alertId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sos_alerts",
          filter: `id=eq.${alertId}`,
        },
        (payload) => {
          const row = payload.new as { status?: string; resolved_at?: string | null };
          if (row.resolved_at || row.status === "resolved") {
            localStorage.removeItem(VICTIM_SOS_KEY);
            setVictimHandoff(null);
            return;
          }
          if (row.status === "accepted") {
            setVictimHandoff({ alertId, phase: "accepted" });
          }
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [victimHandoff?.alertId]);

  useEffect(() => {
    setResponderModalAlert((prev) => {
      if (!prev) return prev;
      const fresh = sosMapAlerts.find((a) => a.id === prev.id);
      if (!fresh) return null;
      return fresh;
    });
  }, [sosMapAlerts]);

  const handleSOSSubmit = useCallback(
    async (issue: SOSIssueType, description: string, photo: File | null) => {
      setSosSubmitting(true);

      const broadcast = async (lat: number, lng: number) => {
        let photoUrl: string | null = null;
        if (photo) {
          const sb = getSupabaseBrowser();
          if (sb) {
            const ext = photo.name.split(".").pop() ?? "jpg";
            const path = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
            const { data, error } = await sb.storage
              .from("sos-photos")
              .upload(path, photo, { cacheControl: "3600", upsert: false });
            if (!error && data) {
              const {
                data: { publicUrl },
              } = sb.storage.from("sos-photos").getPublicUrl(data.path);
              photoUrl = publicUrl;
            }
          }
        }

        let newAlertId: string | null = null;
        try {
          const res = await fetch("/api/sos/broadcast", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: getDeviceId(),
              lat,
              lng,
              issue,
              description,
              photo_url: photoUrl,
            }),
          });
          const j = (await res.json().catch(() => ({}))) as { alert_id?: string };
          if (res.ok && typeof j.alert_id === "string") {
            newAlertId = j.alert_id;
          }
        } finally {
          setSosSubmitting(false);
          onOpenChange(false);
        }
        if (newAlertId) {
          try {
            localStorage.setItem(VICTIM_SOS_KEY, newAlertId);
          } catch {
            /* ignore */
          }
          setVictimHandoff({ alertId: newAlertId, phase: "waiting" });
        }
      };

      if (userCoords) {
        broadcast(userCoords.latitude, userCoords.longitude);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => broadcast(pos.coords.latitude, pos.coords.longitude),
        () => {
          setSosSubmitting(false);
          onOpenChange(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    },
    [userCoords, onOpenChange]
  );

  const handleSOSResolveSubmit = useCallback(
    async (description: string, photo: File | null) => {
      if (!resolveCtx) return;
      const { alertId: resolveAlertId, mode: resolveMode } = resolveCtx;
      setSosResolving(true);

      let photoUrl: string | null = null;
      if (photo) {
        const sb = getSupabaseBrowser();
        if (sb) {
          const ext = photo.name.split(".").pop() ?? "jpg";
          const path = `resolve-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
          const { data, error } = await sb.storage
            .from("sos-photos")
            .upload(path, photo, { cacheControl: "3600", upsert: false });
          if (!error && data) {
            const {
              data: { publicUrl },
            } = sb.storage.from("sos-photos").getPublicUrl(data.path);
            photoUrl = publicUrl;
          }
        }
      }

      try {
        const { client } = getSupabaseBrowserClient();
        const { data: sessionData } = (await client?.auth.getSession()) ?? { data: { session: null } };
        const token = sessionData?.session?.access_token ?? null;
        const asResponder = resolveMode === "responder" && Boolean(token && canReceiveSOSPings);

        const res = await fetch("/api/sos/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            asResponder
              ? {
                  alert_id: resolveAlertId,
                  description,
                  photo_url: photoUrl,
                  access_token: token,
                  as_first_responder: true,
                }
              : {
                  alert_id: resolveAlertId,
                  user_id: getDeviceId(),
                  description,
                  photo_url: photoUrl,
                }
          ),
        });
        if (res.ok) {
          onAlertResolved?.(resolveAlertId);
          setPruneSosId(resolveAlertId);
          setAcceptedTask((t) => (t?.id === resolveAlertId ? null : t));
          setVictimHandoff((v) => {
            if (v?.alertId === resolveAlertId) {
              try {
                localStorage.removeItem(VICTIM_SOS_KEY);
              } catch {
                /* ignore */
              }
              return null;
            }
            return v;
          });
        }
      } finally {
        setSosResolving(false);
        setResolveCtx(null);
      }
    },
    [resolveCtx, canReceiveSOSPings, onAlertResolved]
  );

  const handleResponderAccept = useCallback(
    async (alertId: string) => {
      setAccepting(true);
      setAcceptError("");
      try {
        const { client } = getSupabaseBrowserClient();
        const { data: sessionData } = (await client?.auth.getSession()) ?? { data: { session: null } };
        const token = sessionData?.session?.access_token;
        if (!token) {
          setAcceptError("Sign in to accept an SOS.");
          return false;
        }
        const res = await fetch("/api/sos/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alert_id: alertId, access_token: token }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setAcceptError(j.error ?? "Could not accept this SOS.");
          return false;
        }
        setResponderModalAlert((a) => {
          if (a && a.id === alertId) {
            const updated = { ...a, status: "accepted" as const, responder_id: authUser?.id ?? a.responder_id };
            // Also persist as the accepted task for the persistent resolve button
            setAcceptedTask(updated);
            return updated;
          }
          return a;
        });
        return true;
      } finally {
        setAccepting(false);
      }
    },
    [authUser?.id]
  );

  return (
    <>
      {victimHandoff && (
        <SOSVictimHandshakeBanner
          phase={victimHandoff.phase}
          onMarkResolved={() =>
            setResolveCtx({ alertId: victimHandoff.alertId, mode: "victim" })
          }
        />
      )}

      <SOSResponderHandshakeModal
        alert={responderModalAlert}
        open={responderModalAlert !== null}
        onClose={() => {
          setResponderModalAlert(null);
          setAcceptError("");
        }}
        authUserId={authUser?.id}
        onAccept={handleResponderAccept}
        onMarkResolved={(id) => {
          setResponderModalAlert(null);
          setAcceptError("");
          setResolveCtx({ alertId: id, mode: "responder" });
        }}
        accepting={accepting}
        acceptError={acceptError}
      />

      {/* Persistent resolve button — shown after responder accepts and closes the modal */}
      {acceptedTask && responderModalAlert === null && (
        <button
          type="button"
          onClick={() => setResolveCtx({ alertId: acceptedTask.id, mode: "responder" })}
          className="pointer-events-auto fixed right-4 top-[140px] z-[115] flex items-center gap-2 rounded-xl border border-green-500/50 bg-green-950/90 px-3 py-2 text-xs font-bold text-green-300 shadow-lg shadow-green-900/30 backdrop-blur-xl transition-colors hover:bg-green-900/90"
        >
          <CheckCircle className="h-4 w-4" />
          Mark SOS Resolved
        </button>
      )}

      <SOSAreaPanel
        userCoords={userCoords}
        onFlyTo={(coords) => onFlyTo({ ...coords })}
        onAlertsChange={onAlertsChange}
        onResolveClick={(id) => setResolveCtx({ alertId: id, mode: "victim" })}
        canReceiveSOSPings={canReceiveSOSPings}
        onResponderOpen={canReceiveSOSPings ? setResponderModalAlert : undefined}
        sosAlertIdToPrune={pruneSosId}
        onSosPruneApplied={clearPruneSos}
        open={areaPanelOpen}
        onOpenChange={onAreaPanelOpenChange}
      />

      {open && (
        <SOSIssueSheet
          onSubmit={handleSOSSubmit}
          onClose={() => onOpenChange(false)}
          submitting={sosSubmitting}
        />
      )}

      {resolveCtx && (
        <SOSResolveSheet
          onSubmit={handleSOSResolveSubmit}
          onClose={() => setResolveCtx(null)}
          submitting={sosResolving}
        />
      )}
    </>
  );
}
