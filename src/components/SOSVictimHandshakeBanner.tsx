"use client";

import { useEffect } from "react";
import { Siren, ShieldCheck, Loader2, CheckCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type VictimSosPhase = "waiting" | "accepted" | "resolved";

interface SOSVictimHandshakeBannerProps {
  phase: VictimSosPhase;
  onMarkResolved: () => void;
}

/**
 * Full-width status after the victim submits an SOS — subscribes to DB updates via parent.
 */
export default function SOSVictimHandshakeBanner({
  phase,
  onMarkResolved,
}: SOSVictimHandshakeBannerProps) {
  useEffect(() => {
    if (phase === "accepted" || phase === "waiting") {
      try {
        if ("vibrate" in navigator) navigator.vibrate([80, 40, 80]);
      } catch {
        /* ignore */
      }
    }
  }, [phase]);

  if (phase === "resolved") return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 z-[125] flex items-center justify-center px-4"
    >
      {phase === "waiting" && (
        <div className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-500/40 bg-black/95 px-5 py-5 text-center shadow-2xl shadow-amber-900/20 backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/15 via-transparent to-amber-500/5" />
          <div className="relative flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 ring-1 ring-amber-500/50">
              <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-400">SOS active</p>
              <p className="mt-2 text-lg font-bold text-white">Responders notified</p>
              <p className="mt-2 text-sm text-gray-300">
                Help is on the way — verified responders nearby have been alerted.
              </p>
              <p className="mt-2 text-[11px] text-gray-500">Stay where you are if you can, and stay safe.</p>
            </div>
          </div>
        </div>
      )}

      {phase === "accepted" && (
        <div className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border-2 border-emerald-400/80 bg-emerald-950/95 px-5 py-5 text-center shadow-[0_0_48px_rgba(52,211,153,0.4)] backdrop-blur-xl">
          <div className="pointer-events-none absolute -inset-1 animate-pulse bg-emerald-400/20 blur-md" />
          <div className="relative flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/30 ring-2 ring-emerald-400/60">
              <Siren className="h-6 w-6 text-emerald-200" />
            </div>
            <div>
              <p className="text-xl font-black uppercase tracking-wide text-emerald-300 drop-shadow-sm">
                Help is on the way
              </p>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-semibold text-white">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                Verified responder incoming
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-emerald-100/90">
                A verified responder has accepted your SOS and may be routing to you.
              </p>
            </div>

            <button
              type="button"
              onClick={onMarkResolved}
              className={cn(
                "flex w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-white/20 py-2.5 text-xs font-bold text-white transition-colors",
                "bg-white/10 hover:bg-white/15"
              )}
            >
              <CheckCircle className="h-4 w-4" />
              MARK AS RESOLVED
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
