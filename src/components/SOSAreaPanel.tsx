"use client";

import { useEffect, useState, useCallback } from "react";
import { Siren, Syringe, Stethoscope, HeartPulse, ChevronLeft, ChevronRight, MapPin, CheckCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { getSupabaseBrowser, isSupabaseBrowserConfigured } from "@/lib/supabase-browser";
import type { SOSIssueType } from "@/components/SOSIssueSheet";
import { getDeviceId } from "@/lib/identity";

export interface SOSAlert {
  id: string;
  user_id: string;
  issue: SOSIssueType;
  location_lat: number;
  location_lng: number;
  created_at: string;
  distance_meters: number;
  description?: string | null;
  photo_url?: string | null;
}

// --- helpers ----------------------------------------------------------------

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

const ISSUE_META: Record<SOSIssueType, { icon: React.ElementType; label: string; sub: string; color: string; ring: string }> = {
  allergy: { icon: Syringe,      label: "Allergy",            sub: "Epipen needed",         color: "text-orange-400", ring: "ring-orange-500/40" },
  medical: { icon: Stethoscope,  label: "Medical Assistance", sub: "Immediate help needed",  color: "text-red-400",    ring: "ring-red-500/40"    },
  cpr:     { icon: HeartPulse,   label: "CPR Needed",         sub: "Cardiac emergency",      color: "text-rose-400",   ring: "ring-rose-500/40"   },
};

// --- component --------------------------------------------------------------

interface SOSAreaPanelProps {
  userCoords: { latitude: number; longitude: number } | null;
  onFlyTo: (coords: { latitude: number; longitude: number; zoom: number }) => void;
  onAlertsChange?: (alerts: SOSAlert[]) => void;
  onResolveClick?: (alertId: string) => void;
}

export default function SOSAreaPanel({ userCoords, onFlyTo, onAlertsChange, onResolveClick }: SOSAreaPanelProps) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [loading, setLoading] = useState(false);

  // --- initial fetch ---------------------------------------------------------
  const fetchAlerts = useCallback(async () => {
    if (!userCoords) return;
    const sb = getSupabaseBrowser();
    if (!sb) {
      setAlerts([]);
      onAlertsChange?.([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await sb.rpc("nearby_sos_alerts", {
        lat: userCoords.latitude,
        lng: userCoords.longitude,
        radius_meters: 1000,
      });
      const next = (data as SOSAlert[]) ?? [];
      setAlerts(next);
      onAlertsChange?.(next);
    } finally {
      setLoading(false);
    }
  }, [userCoords, onAlertsChange]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Sync alert list to parent whenever it changes — done via useEffect so we
  // never call a parent setState from inside a child state updater.
  useEffect(() => {
    onAlertsChange?.(alerts);
  }, [alerts, onAlertsChange]);

  // --- Realtime subscription -------------------------------------------------
  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;

    const channel = sb
      .channel("sos-alerts-live")
      // New nearby SOS — add to list and auto-open panel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sos_alerts" },
        (payload) => {
          const row = payload.new as SOSAlert;
          if (!userCoords) return;
          const dist = haversine(
            userCoords.latitude, userCoords.longitude,
            row.location_lat, row.location_lng
          );
          if (dist > 1000) return;
          const alert: SOSAlert = { ...row, distance_meters: dist };
          setAlerts((prev) => [alert, ...prev]);
          setOpen(true);
        }
      )
      // Alert resolved — remove from list and map on ALL devices in range
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sos_alerts" },
        (payload) => {
          const updated = payload.new as { id: string; resolved_at: string | null };
          if (!updated.resolved_at) return;
          setAlerts((prev) => prev.filter((a) => a.id !== updated.id));
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [userCoords, onAlertsChange]);

  const recentCount = alerts.filter(
    (a) => Date.now() - new Date(a.created_at).getTime() < 5 * 60 * 1000
  ).length;

  // --- render ----------------------------------------------------------------
  return (
    <div className="pointer-events-auto flex items-start gap-0">
      {/* Toggle tab */}
      <button
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "relative flex h-10 w-8 items-center justify-center rounded-r-xl border border-l-0 transition-all",
          "border-red-500/30 bg-black/90 shadow-lg shadow-red-900/20 backdrop-blur-xl",
          "hover:bg-red-500/10 active:scale-95"
        )}
        aria-label={open ? "Close SOS panel" : "Open SOS in the area"}
      >
        <Siren className={cn("h-4 w-4", recentCount > 0 ? "text-red-400 animate-pulse" : "text-gray-500")} />
        {recentCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow">
            {recentCount}
          </span>
        )}
        <span className="absolute bottom-0 right-0">
          {open
            ? <ChevronLeft className="h-2.5 w-2.5 text-gray-600" />
            : <ChevronRight className="h-2.5 w-2.5 text-gray-600" />
          }
        </span>
      </button>

      {/* Panel */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          open ? "w-72 opacity-100" : "w-0 opacity-0"
        )}
      >
        <div className="w-72 rounded-r-2xl border border-l-0 border-red-500/20 bg-black/95 shadow-2xl shadow-red-900/30 backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20">
                <Siren className="h-3 w-3 text-red-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">SOS in the Area</p>
                <p className="text-[10px] text-gray-500">Within 1km · live</p>
              </div>
            </div>
            <div className="flex h-4 w-4 items-center justify-center">
              {loading && (
                <span className="h-3 w-3 animate-spin rounded-full border border-red-400 border-t-transparent" />
              )}
            </div>
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto py-1">
            {!userCoords ? (
              <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
                <MapPin className="h-4 w-4 text-gray-600" />
                <p className="text-xs text-gray-500">Enable location to see nearby SOS alerts</p>
              </div>
            ) : !isSupabaseBrowserConfigured() ? (
              <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
                <MapPin className="h-4 w-4 text-gray-600" />
                <p className="text-xs text-gray-500">
                  SOS live feed needs{" "}
                  <span className="font-mono text-[10px] text-gray-400">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
                  <span className="font-mono text-[10px] text-gray-400">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> in{" "}
                  <span className="text-gray-400">.env.local</span>.
                </p>
              </div>
            ) : alerts.length === 0 && !loading ? (
              <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
                <span className="text-xl">✅</span>
                <p className="text-xs font-semibold text-gray-300">All clear nearby</p>
                <p className="text-[10px] text-gray-600">No active SOS alerts within 1km</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/5 px-2">
                {alerts.map((alert) => {
                  const { icon: Icon, label, sub, color, ring } = ISSUE_META[alert.issue] ?? ISSUE_META.medical;
                  const isNew = Date.now() - new Date(alert.created_at).getTime() < 2 * 60 * 1000;
                  return (
                    <li key={alert.id}>
                      <div className="flex items-center gap-1 px-1 py-2">
                        <button
                          onClick={() => onFlyTo({ latitude: alert.location_lat, longitude: alert.location_lng, zoom: 17 })}
                          className="flex flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                        >
                          <div className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/60 ring-1",
                            color, ring,
                            isNew && "animate-pulse"
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className={cn("text-xs font-semibold", color)}>{label}</p>
                              {isNew && (
                                <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-400">
                                  new
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-500">{sub}</p>
                            {alert.description && (
                              <p className="mt-0.5 truncate text-[10px] text-gray-600">{alert.description}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[10px] text-gray-600">
                              {alert.distance_meters < 1000
                                ? `${Math.round(alert.distance_meters)}m`
                                : `${(alert.distance_meters / 1000).toFixed(1)}km`}
                            </p>
                            <p className="text-[10px] text-gray-700">{timeAgo(alert.created_at)}</p>
                          </div>
                        </button>

                        {/* Resolve button — only shown to the alert's sender */}
                        {alert.user_id === getDeviceId() && onResolveClick && (
                          <button
                            onClick={() => onResolveClick(alert.id)}
                            title="Mark as resolved"
                            className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 transition-colors hover:bg-green-500/20"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
