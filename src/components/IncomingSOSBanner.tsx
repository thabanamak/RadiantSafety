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
      className="pointer-events-auto fixed inset-0 z-[200] flex items-center justify-center px-5"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onDismiss} />

      {/* Card */}
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border-2 border-red-500/60 bg-black/98 shadow-[0_0_80px_rgba(239,68,68,0.4)] backdrop-blur-xl">
        {/* Animated glow border */}
        <div className="pointer-events-none absolute -inset-px animate-pulse rounded-3xl bg-red-500/20 blur-sm" />

        <div className="relative px-6 py-7">
          {/* Dismiss */}
          <button
            onClick={onDismiss}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Icon */}
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/20 ring-2 ring-red-500/50">
            <Siren className="h-10 w-10 animate-pulse text-red-400" />
          </div>

          {/* Label */}
          <div className="mb-2 flex items-center justify-center gap-2">
            <p className="text-sm font-black uppercase tracking-widest text-red-400">Incoming SOS</p>
            <span className="rounded-full bg-red-500/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
              live
            </span>
          </div>

          {/* Name */}
          <p className="text-center text-2xl font-black text-white">{sos.friendName}</p>
          <p className="mt-1 text-center text-base font-semibold text-red-300">needs help now</p>
          <p className="mt-1 text-center text-xs text-gray-500">{sos.time}</p>

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => { onLocate(sos.coordinates); onDismiss(); }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-900/50 transition-all hover:bg-red-500 active:scale-95"
            >
              <MapPin className="h-4 w-4" />
              Navigate There
            </button>
            <button
              onClick={onDismiss}
              className="flex flex-1 items-center justify-center rounded-2xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-gray-300 transition-all hover:bg-white/10 active:scale-95"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
