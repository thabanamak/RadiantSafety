"use client";

import { Loader2, MapPin, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type SelectedDestination = {
  name: string;
  coordinates: [number, number]; // [lng, lat]
};

type RouteLoadingPhase = "location" | "route";

type Props = {
  selectedDestination: SelectedDestination | null;
  hasActiveRoute: boolean;
  routeLoading: boolean;
  /** When waiting on GPS vs the backend — avoids “Calculating” during a 60s geo wait */
  routeLoadingPhase?: RouteLoadingPhase | null;
  routeError: string | null;
  /** Non-error hint, e.g. when the route starts from map center instead of GPS */
  routeInfo?: string | null;
  onGetSafeRoute: () => void;
  onCloseDestination: () => void;
  onEndRoute: () => void;
};

export default function ContextualDirectionsCards({
  selectedDestination,
  hasActiveRoute,
  routeLoading,
  routeLoadingPhase = null,
  routeError,
  routeInfo = null,
  onGetSafeRoute,
  onCloseDestination,
  onEndRoute,
}: Props) {
  if (!selectedDestination) return null;

  if (hasActiveRoute) {
    return (
      <div
        className={cn(
          "pointer-events-auto fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[60] w-[min(100%-1.5rem,28rem)] max-w-[calc(100vw-1.5rem)] -translate-x-1/2",
          "sm:bottom-28"
        )}
      >
        <div className="rounded-2xl border border-white/15 bg-zinc-950/95 px-4 py-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Active route</p>
              <p className="mt-0.5 truncate text-sm font-medium text-white">{selectedDestination.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onEndRoute}
            className="w-full rounded-xl border border-white/15 bg-white/10 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            End route
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-auto fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[60] w-[min(100%-1.5rem,28rem)] max-w-[calc(100vw-1.5rem)] -translate-x-1/2",
        "sm:bottom-28"
      )}
    >
      <div className="rounded-2xl border border-white/15 bg-zinc-950/95 px-4 py-4 shadow-2xl backdrop-blur-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 gap-2">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/20">
              <MapPin className="h-4 w-4 text-rose-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Destination</p>
              <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-white">
                {selectedDestination.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseDestination}
            className="shrink-0 rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {routeError && (
          <p className="mb-3 rounded-lg bg-red-950/60 px-3 py-2 text-xs text-red-200">{routeError}</p>
        )}
        {routeInfo && !routeError && (
          <p className="mb-3 rounded-lg border border-cyan-500/25 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-100/90">
            {routeInfo}
          </p>
        )}
        <button
          type="button"
          disabled={routeLoading}
          onClick={onGetSafeRoute}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00BFFF] py-3.5 text-sm font-semibold text-zinc-950 shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {routeLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {routeLoadingPhase === "location"
                ? "Finding your location…"
                : routeLoadingPhase === "route"
                  ? "Computing safe route…"
                  : "Calculating…"}
            </>
          ) : (
            "Get safe route"
          )}
        </button>
      </div>
    </div>
  );
}
