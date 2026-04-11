"use client";

import { Loader2, Navigation, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SelectedDestination } from "@/components/ContextualDirectionsCards";
import RouteLocationField from "@/components/RouteLocationField";

type RouteLoadingPhase = "location" | "route";

type Props = {
  mapCenter?: { latitude: number; longitude: number; zoom: number } | null;
  hasUserLocation: boolean;
  hasActiveRoute: boolean;
  onEndRoute: () => void;
  routeStartCustom: SelectedDestination | null;
  onRouteStartCustomChange: (next: SelectedDestination | null) => void;
  routeEnd: SelectedDestination | null;
  onRouteEndChange: (next: SelectedDestination | null) => void;
  routeLoading: boolean;
  routeLoadingPhase?: RouteLoadingPhase | null;
  routeError: string | null;
  routeInfo?: string | null;
  onGetSafeRoute: () => void;
  onClose: () => void;
};

export default function RoutePlannerPanel({
  mapCenter,
  hasUserLocation,
  hasActiveRoute,
  onEndRoute,
  routeStartCustom,
  onRouteStartCustomChange,
  routeEnd,
  onRouteEndChange,
  routeLoading,
  routeLoadingPhase = null,
  routeError,
  routeInfo = null,
  onGetSafeRoute,
  onClose,
}: Props) {
  const canSubmit = Boolean(routeEnd);

  if (hasActiveRoute && routeEnd) {
    return (
      <div
        className={cn(
          "pointer-events-auto fixed bottom-24 left-1/2 z-[60] w-[min(100%-1.5rem,28rem)] -translate-x-1/2",
          "sm:bottom-28"
        )}
      >
        <div className="rounded-2xl border border-white/15 bg-zinc-950/95 px-4 py-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Active route</p>
              <p className="mt-0.5 truncate text-sm font-medium text-white">{routeEnd.name}</p>
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
        "pointer-events-auto fixed bottom-24 left-1/2 z-[60] w-[min(100%-1.5rem,28rem)] -translate-x-1/2",
        "sm:bottom-28"
      )}
    >
      <div className="rounded-2xl border border-white/15 bg-zinc-950/95 px-4 py-4 shadow-2xl backdrop-blur-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 gap-2">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/20">
              <Navigation className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Directions planner</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                Pick two spots (stations, malls, landmarks, suburbs, or street addresses). Start defaults to your
                location.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close planner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 space-y-3">
          <div>
            <RouteLocationField
              id="route-start"
              label="Start location"
              mapCenter={mapCenter ? { latitude: mapCenter.latitude, longitude: mapCenter.longitude } : null}
              value={routeStartCustom}
              onChange={onRouteStartCustomChange}
              placeholder="From: station, landmark, suburb…"
              disabled={routeLoading}
            />
            {!routeStartCustom && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-cyan-300/90">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                {hasUserLocation ? "Using current location" : "Using map center or GPS when you run the route"}
              </p>
            )}
          </div>

          <RouteLocationField
            id="route-end"
            label="End location"
            mapCenter={mapCenter ? { latitude: mapCenter.latitude, longitude: mapCenter.longitude } : null}
            value={routeEnd}
            onChange={onRouteEndChange}
            placeholder="To: station, landmark, suburb…"
            disabled={routeLoading}
          />
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
          disabled={routeLoading || !canSubmit}
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
