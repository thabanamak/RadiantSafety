"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Info } from "lucide-react";

type Center = { latitude: number; longitude: number; zoom: number };

type VicPolIncident = {
  id: string;
  title: string;
  url: string;
  suburb: string | null;
  latitude: number | null;
  longitude: number | null;
  intensity: number;
  trustScore: number;
};

type SupabaseIncident = {
  id: string;
  title: string;
  suburb: string;
  location_lat: number;
  location_lng: number;
  intensity: number;
  source: string;
  is_verified: boolean;
};

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function zoomRadiusKm(zoom: number) {
  // Rough “what feels local” radius. Tuned for Melbourne-scale browsing.
  if (zoom >= 16) return 1.0;
  if (zoom >= 15) return 1.5;
  if (zoom >= 14) return 2.5;
  if (zoom >= 13) return 4.0;
  return 7.5;
}

function tokenizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length >= 4)
    .filter((w) => !["victoria", "police", "melbourne", "update", "appeal", "after"].includes(w));
}

export default function AreaIncidentSummary({
  center,
  vicpolItems,
  supabaseItems,
  active,
  className,
}: {
  center: Center | null;
  vicpolItems: VicPolIncident[];
  supabaseItems: SupabaseIncident[];
  active: boolean;
  className?: string;
}) {
  const [infoOpen, setInfoOpen] = useState(false);

  const summary = useMemo(() => {
    if (!center) return null;
    const radiusKm = zoomRadiusKm(center.zoom);
    const c = { lat: center.latitude, lng: center.longitude };

    const vicpolLocal = vicpolItems
      .filter((i) => i.latitude != null && i.longitude != null)
      .map((i) => ({
        source: "VicPol" as const,
        id: i.id,
        title: i.title,
        intensity: i.intensity,
        lat: i.latitude as number,
        lng: i.longitude as number,
      }))
      .filter((i) => haversineKm(c, { lat: i.lat, lng: i.lng }) <= radiusKm);

    const supaLocal = supabaseItems
      .map((i) => ({
        source: "Historical" as const,
        id: i.id,
        title: i.title,
        intensity: i.intensity,
        lat: i.location_lat,
        lng: i.location_lng,
      }))
      .filter((i) => haversineKm(c, { lat: i.lat, lng: i.lng }) <= radiusKm);

    const local = [...vicpolLocal, ...supaLocal];
    const total = local.length;
    const high = local.filter((i) => i.intensity >= 8).length;
    const mid = local.filter((i) => i.intensity >= 5 && i.intensity <= 7).length;
    const low = local.filter((i) => i.intensity <= 4).length;

    const avg = total === 0 ? null : Math.round((local.reduce((s, i) => s + i.intensity, 0) / total) * 10) / 10;

    const wordCounts = new Map<string, number>();
    for (const i of local.slice(0, 40)) {
      for (const w of tokenizeTitle(i.title)) {
        wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
      }
    }
    const topWords = [...wordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([w]) => w);

    return { radiusKm, total, high, mid, low, avg, topWords };
  }, [center, vicpolItems, supabaseItems]);

  if (!active || !center || !summary) return null;

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "pointer-events-auto rounded-2xl border border-radiant-border bg-radiant-surface/90 p-4 shadow-2xl backdrop-blur-xl"
        )}
        onPointerDown={() => setInfoOpen(false)}
      >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Area summary</p>
            <button
              type="button"
              aria-label="How offences are graded"
              className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-lg border border-radiant-border bg-radiant-card text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setInfoOpen((p) => !p);
              }}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 text-sm font-semibold text-gray-100">
            Within ~{summary.radiusKm.toFixed(summary.radiusKm < 2 ? 1 : 0)} km of map center
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Avg intensity</p>
          <p className="text-sm font-bold text-gray-100">{summary.avg == null ? "—" : `${summary.avg}/10`}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="High (8–10)" value={summary.high} valueClass="text-red-300" />
        <Stat label="Mid (5–7)" value={summary.mid} valueClass="text-amber-200" />
        <Stat label="Low (1–4)" value={summary.low} valueClass="text-gray-200" />
      </div>
      </div>

      {infoOpen && (
        <div
          className="pointer-events-auto absolute left-0 top-10 z-50 w-[340px] rounded-2xl border border-radiant-border bg-radiant-surface/95 p-4 shadow-2xl backdrop-blur-xl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-100">How offences are graded</p>
              <p className="mt-1 text-[11px] text-gray-500">
                We assign an <span className="text-gray-300">intensity score (1–10)</span> by scanning the incident title
                for keywords. The map summary buckets those scores into High/Mid/Low.
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg border border-radiant-border bg-radiant-card px-2 py-1 text-[11px] font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
              onClick={() => setInfoOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="mt-3 space-y-2 text-[11px] text-gray-500">
            <div className="rounded-xl border border-radiant-border bg-radiant-card px-3 py-2">
              <p className="font-semibold text-red-300">High (8–10)</p>
              <p className="mt-0.5">Keywords like: homicide, murder, shooting, firearm, stabbing, sexual assault.</p>
            </div>
            <div className="rounded-xl border border-radiant-border bg-radiant-card px-3 py-2">
              <p className="font-semibold text-amber-200">Mid (5–7)</p>
              <p className="mt-0.5">Keywords like: fatal crash, fire, drug, aggravated burglary, arson.</p>
            </div>
            <div className="rounded-xl border border-radiant-border bg-radiant-card px-3 py-2">
              <p className="font-semibold text-gray-200">Low (1–4)</p>
              <p className="mt-0.5">Keywords like: theft, speeding, missing, vandalism, burglary.</p>
            </div>
          </div>

          <p className="mt-3 text-[10px] text-gray-600">
            Note: this is a heuristic based on headlines, not a legal classification.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-radiant-border bg-radiant-card px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">{label}</p>
      <p className={cn("mt-0.5 text-base font-bold text-gray-100", valueClass)}>{value}</p>
    </div>
  );
}

