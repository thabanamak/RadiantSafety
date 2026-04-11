"use client";

import { X, Siren, MapPin, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SOSIncident } from "@/app/api/sos/route";
import { SOS_ISSUE_LABELS, type SOSIssueType } from "@/components/SOSIssueSheet";

interface SOSResultsSheetProps {
  incidents: SOSIncident[];
  loading: boolean;
  issue: SOSIssueType;
  onClose: () => void;
  onViewIncident: (incident: SOSIncident) => void;
}

const intensityColor = (n: number) => {
  if (n >= 8) return "text-red-400";
  if (n >= 5) return "text-amber-400";
  return "text-yellow-300";
};

const intensityLabel = (n: number) => {
  if (n >= 8) return "High";
  if (n >= 5) return "Medium";
  return "Low";
};

export default function SOSResultsSheet({
  incidents,
  loading,
  issue,
  onClose,
  onViewIncident,
}: SOSResultsSheetProps) {
  const { title } = SOS_ISSUE_LABELS[issue];
  return (
    <div className="pointer-events-auto absolute bottom-24 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 px-4 sm:left-6 sm:translate-x-0 sm:px-0">
      <div className="rounded-2xl border border-red-500/30 bg-black/95 shadow-2xl shadow-red-900/40 backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/20">
              <Siren className="h-3.5 w-3.5 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">SOS — {title}</p>
              <p className="text-[11px] text-gray-400">
                {loading
                  ? "Scanning 1km radius…"
                  : `${incidents.length} incident${incidents.length !== 1 ? "s" : ""} within 1km`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-colors"
            aria-label="Close SOS results"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
              <span className="text-sm text-gray-400">Searching…</span>
            </div>
          ) : incidents.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-8 text-center">
              <span className="text-2xl">✅</span>
              <p className="text-sm font-semibold text-gray-200">Area looks clear</p>
              <p className="text-xs text-gray-500">No recorded incidents within 1km</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5 px-2 py-1">
              {incidents.map((inc) => (
                <li key={inc.id}>
                  <button
                    onClick={() => onViewIncident(inc)}
                    className="flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-white/5"
                  >
                    <AlertTriangle
                      className={cn("mt-0.5 h-4 w-4 shrink-0", intensityColor(inc.intensity))}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-100">{inc.title}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[10px] text-gray-500">
                          <MapPin className="h-2.5 w-2.5" />
                          {inc.suburb ?? "Unknown suburb"}
                        </span>
                        <span className={cn("text-[10px] font-medium", intensityColor(inc.intensity))}>
                          {intensityLabel(inc.intensity)}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] text-gray-600">
                      {inc.distance_meters < 1000
                        ? `${Math.round(inc.distance_meters)}m`
                        : `${(inc.distance_meters / 1000).toFixed(1)}km`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
