"use client";

import { useState, useCallback } from "react";
import {
  Crosshair,
  Loader2,
  MapPinned,
  MapPin,
  MousePointerClick,
  Navigation,
  X,
} from "lucide-react";
import type { SafeRouteLineFeature } from "@/lib/safe-route";
import { explainGeoError, getCurrentPositionBestEffort, parseManualCoords } from "@/lib/geolocation";

type Props = {
  hasStart: boolean;
  hasEnd: boolean;
  canCompute: boolean;
  loading: boolean;
  error: string | null;
  route: SafeRouteLineFeature | null;
  mapCenterReady: boolean;
  dropPinMode: boolean;
  onSetStartFromGps: (lat: number, lng: number) => void;
  onSetStartFromMapCenter: () => void;
  onSetStartManual: (lat: number, lng: number) => void;
  onClearStart: () => void;
  onSetEndFromGps: (lat: number, lng: number) => void;
  onSetEndFromMapCenter: () => void;
  onSetEndManual: (lat: number, lng: number) => void;
  onClearEnd: () => void;
  onTogglePickEndOnMap: () => void;
  onCompute: () => void;
  onClear: () => void;
};

export default function SafeRoutePanel({
  hasStart,
  hasEnd,
  canCompute,
  loading,
  error,
  route,
  mapCenterReady,
  dropPinMode,
  onSetStartFromGps,
  onSetStartFromMapCenter,
  onSetStartManual,
  onClearStart,
  onSetEndFromGps,
  onSetEndFromMapCenter,
  onSetEndManual,
  onClearEnd,
  onTogglePickEndOnMap,
  onCompute,
  onClear,
}: Props) {
  const [startGpsLoading, setStartGpsLoading] = useState(false);
  const [endGpsLoading, setEndGpsLoading] = useState(false);
  const [startBanner, setStartBanner] = useState<string | null>(null);
  const [endBanner, setEndBanner] = useState<string | null>(null);

  const [showStartManual, setShowStartManual] = useState(false);
  const [startManualLat, setStartManualLat] = useState("-37.8136");
  const [startManualLng, setStartManualLng] = useState("144.9631");

  const [showEndManual, setShowEndManual] = useState(false);
  const [endManualLat, setEndManualLat] = useState("-37.8200");
  const [endManualLng, setEndManualLng] = useState("144.9700");

  const handleStartMyLocation = useCallback(async () => {
    setStartBanner(null);
    setStartGpsLoading(true);
    try {
      const { latitude, longitude } = await getCurrentPositionBestEffort();
      onSetStartFromGps(latitude, longitude);
    } catch (e) {
      setStartBanner(explainGeoError(e as GeolocationPositionError));
    } finally {
      setStartGpsLoading(false);
    }
  }, [onSetStartFromGps]);

  const handleEndMyLocation = useCallback(async () => {
    setEndBanner(null);
    setEndGpsLoading(true);
    try {
      const { latitude, longitude } = await getCurrentPositionBestEffort();
      onSetEndFromGps(latitude, longitude);
    } catch (e) {
      setEndBanner(explainGeoError(e as GeolocationPositionError));
    } finally {
      setEndGpsLoading(false);
    }
  }, [onSetEndFromGps]);

  const applyStartManual = useCallback(() => {
    setStartBanner(null);
    try {
      const { latitude, longitude } = parseManualCoords(startManualLat.trim(), startManualLng.trim());
      onSetStartManual(latitude, longitude);
      setShowStartManual(false);
    } catch (e) {
      setStartBanner(e instanceof Error ? e.message : "Invalid coordinates");
    }
  }, [startManualLat, startManualLng, onSetStartManual]);

  const applyEndManual = useCallback(() => {
    setEndBanner(null);
    try {
      const { latitude, longitude } = parseManualCoords(endManualLat.trim(), endManualLng.trim());
      onSetEndManual(latitude, longitude);
      setShowEndManual(false);
    } catch (e) {
      setEndBanner(e instanceof Error ? e.message : "Invalid coordinates");
    }
  }, [endManualLat, endManualLng, onSetEndManual]);

  const dist = route?.properties.distance_meters;
  const durSec = route?.properties.duration_seconds;
  const peak = route?.properties.peak_heat;

  return (
    <div className="pointer-events-auto absolute bottom-28 left-1/2 z-40 flex max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4 sm:bottom-32">
      {/* Start */}
      <div className="w-full max-w-md rounded-2xl border border-radiant-border bg-radiant-surface/95 px-3 py-2.5 shadow-xl backdrop-blur-xl">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Route start
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={startGpsLoading}
            onClick={handleStartMyLocation}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/40 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-900/50 disabled:opacity-60"
          >
            {startGpsLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Navigation className="h-3.5 w-3.5" />
            )}
            Ping my location
          </button>
          <button
            type="button"
            disabled={!mapCenterReady}
            onClick={onSetStartFromMapCenter}
            className="inline-flex items-center gap-1.5 rounded-xl border border-radiant-border px-2.5 py-1.5 text-[11px] font-semibold text-gray-300 transition hover:bg-white/5 disabled:opacity-50"
            title="Use map center as start"
          >
            <Crosshair className="h-3.5 w-3.5 text-amber-400" />
            Map view
          </button>
          <button
            type="button"
            onClick={() => setShowStartManual((s) => !s)}
            className="inline-flex items-center gap-1 rounded-xl border border-radiant-border px-2.5 py-1.5 text-[11px] font-medium text-gray-400 hover:text-gray-200"
          >
            <MapPin className="h-3.5 w-3.5" />
            Type coords
          </button>
          {hasStart && (
            <button
              type="button"
              onClick={onClearStart}
              className="ml-auto text-[11px] text-gray-500 underline-offset-2 hover:text-gray-300 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        {showStartManual && (
          <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-radiant-border pt-2">
            <label className="flex min-w-[100px] flex-1 flex-col gap-0.5 text-[10px] text-gray-500">
              Latitude
              <input
                value={startManualLat}
                onChange={(e) => setStartManualLat(e.target.value)}
                className="rounded-lg border border-radiant-border bg-radiant-card px-2 py-1 text-xs text-gray-200"
              />
            </label>
            <label className="flex min-w-[100px] flex-1 flex-col gap-0.5 text-[10px] text-gray-500">
              Longitude
              <input
                value={startManualLng}
                onChange={(e) => setStartManualLng(e.target.value)}
                className="rounded-lg border border-radiant-border bg-radiant-card px-2 py-1 text-xs text-gray-200"
              />
            </label>
            <button
              type="button"
              onClick={applyStartManual}
              className="rounded-lg bg-gray-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-gray-600"
            >
              Apply
            </button>
          </div>
        )}
        {startBanner && (
          <p className="mt-2 text-[11px] leading-snug text-amber-200/95">{startBanner}</p>
        )}
        {hasStart && (
          <p className="mt-1.5 text-[10px] text-cyan-400/90">Start set — blue dot.</p>
        )}
      </div>

      {/* End */}
      <div className="w-full max-w-md rounded-2xl border border-radiant-border bg-radiant-surface/95 px-3 py-2.5 shadow-xl backdrop-blur-xl">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Route end
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={endGpsLoading}
            onClick={handleEndMyLocation}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950/30 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-900/40 disabled:opacity-60"
          >
            {endGpsLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Navigation className="h-3.5 w-3.5" />
            )}
            Ping my location
          </button>
          <button
            type="button"
            disabled={!mapCenterReady}
            onClick={onSetEndFromMapCenter}
            className="inline-flex items-center gap-1.5 rounded-xl border border-radiant-border px-2.5 py-1.5 text-[11px] font-semibold text-gray-300 transition hover:bg-white/5 disabled:opacity-50"
            title="Use map center as destination"
          >
            <Crosshair className="h-3.5 w-3.5 text-amber-400" />
            Map view
          </button>
          <button
            type="button"
            onClick={() => setShowEndManual((s) => !s)}
            className="inline-flex items-center gap-1 rounded-xl border border-radiant-border px-2.5 py-1.5 text-[11px] font-medium text-gray-400 hover:text-gray-200"
          >
            <MapPin className="h-3.5 w-3.5" />
            Type coords
          </button>
          <button
            type="button"
            onClick={onTogglePickEndOnMap}
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition ${
              dropPinMode
                ? "border-amber-500 bg-amber-500/20 text-amber-200"
                : "border-radiant-border text-gray-300 hover:bg-white/5"
            }`}
            title="Tap the map to place the red destination pin"
          >
            <MousePointerClick className="h-3.5 w-3.5" />
            Tap map
          </button>
          {hasEnd && (
            <button
              type="button"
              onClick={onClearEnd}
              className="ml-auto text-[11px] text-gray-500 underline-offset-2 hover:text-gray-300 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        {showEndManual && (
          <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-radiant-border pt-2">
            <label className="flex min-w-[100px] flex-1 flex-col gap-0.5 text-[10px] text-gray-500">
              Latitude
              <input
                value={endManualLat}
                onChange={(e) => setEndManualLat(e.target.value)}
                className="rounded-lg border border-radiant-border bg-radiant-card px-2 py-1 text-xs text-gray-200"
              />
            </label>
            <label className="flex min-w-[100px] flex-1 flex-col gap-0.5 text-[10px] text-gray-500">
              Longitude
              <input
                value={endManualLng}
                onChange={(e) => setEndManualLng(e.target.value)}
                className="rounded-lg border border-radiant-border bg-radiant-card px-2 py-1 text-xs text-gray-200"
              />
            </label>
            <button
              type="button"
              onClick={applyEndManual}
              className="rounded-lg bg-gray-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-gray-600"
            >
              Apply
            </button>
          </div>
        )}
        {endBanner && (
          <p className="mt-2 text-[11px] leading-snug text-amber-200/95">{endBanner}</p>
        )}
        {hasEnd && (
          <p className="mt-1.5 text-[10px] text-rose-300/90">End set — red pin.</p>
        )}
        {dropPinMode && (
          <p className="mt-1 text-[10px] text-amber-200/90">Tap the map to drop the red pin.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-radiant-border bg-radiant-surface/95 px-3 py-2.5 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <MapPinned className="h-4 w-4 shrink-0 text-cyan-400" />
          <span className="hidden sm:inline">Blue = start · Red = end</span>
          <span className="sm:hidden">Start → end</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canCompute || loading}
            onClick={onCompute}
            className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Navigation className="h-3.5 w-3.5" />
            )}
            Heat-aware route
          </button>
          {route && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-xl border border-radiant-border p-1.5 text-gray-400 transition hover:bg-white/5 hover:text-white"
              aria-label="Clear route"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="max-w-sm rounded-lg bg-red-950/80 px-3 py-2 text-center text-xs text-red-200">
          {error}
        </p>
      )}

      {route && dist != null && (
        <div className="rounded-xl border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-center text-[11px] text-cyan-100/90">
          {(dist / 1000).toFixed(2)} km
          {durSec != null && durSec > 0 && (
            <>
              {" · "}
              {durSec >= 3600
                ? `${Math.floor(durSec / 3600)}h ${Math.round((durSec % 3600) / 60)}min`
                : `${Math.round(durSec / 60)} min`}
              {" ETA"}
            </>
          )}
          {" · peak heat "}
          {peak != null ? (peak * 100).toFixed(1) : "—"}%
        </div>
      )}

      {!hasStart && !hasEnd && !route && (
        <p className="max-w-sm text-center text-[11px] text-gray-500">
          Set <strong className="text-cyan-400/90">start</strong> and <strong className="text-rose-300/90">end</strong> above, then run the route.
        </p>
      )}
    </div>
  );
}
