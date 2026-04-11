"use client";

import { useEffect, useRef } from "react";
import { Siren, MapPin, X } from "lucide-react";

export interface IncomingSOS {
  friendName: string;
  coordinates: [number, number]; // [lng, lat]
  time: string;
}

interface IncomingSOSBannerProps {
  sos: IncomingSOS | null;
  onDismiss: () => void;
  onLocate: (coordinates: [number, number]) => void;
}

/** Auto-dismiss after this many ms if the user doesn't interact. */
const AUTO_DISMISS_MS = 30_000;

export default function IncomingSOSBanner({ sos, onDismiss, onLocate }: IncomingSOSBannerProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sos) return;
    timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sos, onDismiss]);

  if (!sos) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="pointer-events-auto absolute left-1/2 top-[72px] z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2"
    >
      {/* Outer glow ring */}
      <div className="animate-pulse absolute -inset-0.5 rounded-2xl bg-red-500/30 blur-md" />

      <div className="relative flex items-start gap-3 rounded-2xl border border-red-500/40 bg-black/95 px-4 py-3.5 shadow-2xl shadow-red-900/50 backdrop-blur-xl">
        {/* Pulsing icon */}
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/20 ring-1 ring-red-500/40">
          <Siren className="h-4 w-4 animate-pulse text-red-400" />
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-red-400">
              Incoming SOS
            </p>
            <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-400">
              live
            </span>
          </div>
          <p className="mt-0.5 text-sm font-semibold text-white">{sos.friendName} needs help</p>
          <p className="text-[11px] text-gray-400">{sos.time}</p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => {
              onLocate(sos.coordinates);
              onDismiss();
            }}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 ring-1 ring-red-500/30 transition-colors hover:bg-red-500/30 active:scale-95"
          >
            <MapPin className="h-3 w-3" />
            Go
          </button>
          <button
            onClick={onDismiss}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
            aria-label="Dismiss alert"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
