"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { DroppedPin } from "@/components/RadiantMap";

/** Mapbox / react-map-gl touch `window` — must not SSR or the whole page can white-screen. */
const RadiantMap = dynamic(() => import("@/components/RadiantMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a] text-sm text-gray-400">
      Loading map…
    </div>
  ),
});
import TopNav from "@/components/TopNav";
import type { AuthUser, IncidentTab } from "@/components/TopNav";
import QuickReportFAB, { type PinLocation } from "@/components/QuickReportFAB";
import AuthModal from "@/components/AuthModal";
import ContextualDirectionsCards from "@/components/ContextualDirectionsCards";
import type { SelectedDestination } from "@/components/ContextualDirectionsCards";
import RoutePlannerPanel from "@/components/RoutePlannerPanel";
import RouteToast from "@/components/RouteToast";
import {
  isWithinSafenetCoverage,
  SAFENET_COVERAGE_ERROR,
  SAFENET_UNROUTABLE_ERROR,
} from "@/lib/safenet-bbox";
import { currentUser } from "@/lib/mock-data";
import { explainGeoError, getCurrentPositionBestEffort } from "@/lib/geolocation";
import {
  capIncidents,
  responseToLineFeature,
  type SafeRouteIncident,
  type SafeRouteResponse,
} from "@/lib/safe-route";
import { computeClientSafeRoute, readSafeRouteEngineMode } from "@/lib/client-safe-route";
import type { MapIncidentPoint, UserReport } from "@/lib/types";
import NewsIncidentFeed from "@/components/NewsIncidentFeed";
import AreaIncidentSummary from "@/components/AreaIncidentSummary";
import type { SOSAlert } from "@/components/SOSAreaPanel";
import type { FriendLocation } from "@/components/RadiantMap";
import SOSController from "@/features/sos/SOSController";
import FindMyController from "@/features/find-my/FindMyController";
import DirectionsController from "@/features/directions/DirectionsController";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { LocateFixed, LocateOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

interface VicPolIncident {
  id: string;
  title: string;
  url: string;
  suburb: string | null;
  latitude: number | null;
  longitude: number | null;
  intensity: number;
  trustScore: number;
}

interface SupabaseIncident {
  id: string;
  title: string;
  suburb: string;
  location_lat: number;
  location_lng: number;
  intensity: number;
  source: string;
  is_verified: boolean;
}

type ModalState = "closed" | "login" | "signup";

export default function Dashboard() {
  const [flyTarget, setFlyTarget] = useState<{
    latitude: number;
    longitude: number;
    zoom?: number;
  } | null>(null);

  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number; zoom: number } | null>(null);

  const [activeIncidentTab, setActiveIncidentTab] = useState<IncidentTab>("official");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [modalState, setModalState] = useState<ModalState>("closed");


  const [vicpolLoaded, setVicpolLoaded] = useState(false);
  const [vicpolLoading, setVicpolLoading] = useState(false);
  const [vicpolItems, setVicpolItems] = useState<VicPolIncident[]>([]);

  const [supabaseItems, setSupabaseItems] = useState<SupabaseIncident[]>([]);

  // Location pin state — shared between FAB and map
  const [dropPinMode, setDropPinMode] = useState(false);
  const [droppedPin, setDroppedPin] = useState<DroppedPin | null>(null);
  const [gpsPin, setGpsPin] = useState<DroppedPin | null>(null);

  // Live device location (Phase 3) — "you are here" cyan dot
  const { coords: userCoords, permission: locationPermission } = useUserLocation();
  const hasCenteredOnUser = useRef(false);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);

  // Fly to user's location on first GPS fix
  useEffect(() => {
    if (userCoords && !hasCenteredOnUser.current) {
      setFlyTarget({ latitude: userCoords.latitude, longitude: userCoords.longitude, zoom: 15 });
      hasCenteredOnUser.current = true;
    }
  }, [userCoords]);

  // Heartbeat (Phase 4) — passive 60s ping to user_pulse
  useHeartbeat({ coords: userCoords, mode: "passive" });

  // SOS — sheet open state is owned here so the FAB can trigger it;
  // all other SOS logic lives in SOSController
  const [showSOSSheet, setShowSOSSheet] = useState(false);
  const [sosMapAlerts, setSosMapAlerts] = useState<SOSAlert[]>([]);

  // Find My — friend locations for the map; populated by FindMyController
  const [friendLocations, setFriendLocations] = useState<FriendLocation[]>([]);

  // Directions — active route for the map; populated by DirectionsController
  const [activeRoute, setActiveRoute] = useState<{ geometry: GeoJSON.LineString } | null>(null);

  const [selectedDestination, setSelectedDestination] = useState<SelectedDestination | null>(null);
  const [safeRouteData, setSafeRouteData] = useState<[number, number][] | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeLoadingPhase, setRouteLoadingPhase] = useState<"location" | "route" | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<string | null>(null);
  const [directionsMode, setDirectionsMode] = useState(false);
  const [routeStartCustom, setRouteStartCustom] = useState<SelectedDestination | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const dismissToast = useCallback(() => setToastMessage(null), []);

  const handleViewMap = useCallback((report: UserReport) => {
    setFlyTarget({ latitude: report.latitude, longitude: report.longitude });
  }, []);

  const handleSelectArea = useCallback(
    (payload: {
      latitude: number;
      longitude: number;
      zoom: number;
      placeName: string;
      center: [number, number];
    }) => {
      setFlyTarget({
        latitude: payload.latitude,
        longitude: payload.longitude,
        zoom: payload.zoom,
      });
      setSelectedDestination({
        name: payload.placeName,
        coordinates: payload.center,
      });
      setSafeRouteData(null);
      setRouteError(null);
      setRouteInfo(null);
    },
    []
  );

  const handleAuth = useCallback((user: AuthUser) => {
    setAuthUser(user);
  }, []);

  const handleLogout = useCallback(() => {
    setAuthUser(null);
  }, []);

  const loadVicPol = useCallback(async () => {
    if (vicpolLoading || vicpolLoaded) return;
    setVicpolLoaded(true);
    setVicpolLoading(true);
    try {
      const res = await fetch("/api/vicpol-incidents", { cache: "no-store" });
      const data = (await res.json()) as { items?: VicPolIncident[] };
      setVicpolItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setVicpolItems([]);
    } finally {
      setVicpolLoading(false);
    }
  }, [vicpolLoading, vicpolLoaded]);

  const loadSupabaseIncidents = useCallback(async () => {
    try {
      const res = await fetch("/api/supabase-incidents");
      const data = (await res.json()) as { items?: SupabaseIncident[] };
      setSupabaseItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setSupabaseItems([]);
    }
  }, []);

  // Auto-load VicPol + Supabase historical incidents on mount
  useEffect(() => {
    loadVicPol();
    loadSupabaseIncidents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vicpolMapPoints: MapIncidentPoint[] = vicpolItems
    .filter((i) => i.latitude != null && i.longitude != null)
    .map((i) => ({
      id: i.id,
      latitude: i.latitude as number,
      longitude: i.longitude as number,
      trustScore: i.trustScore,
      category: "Suspicious Activity",
    }));

  const supabaseMapPoints: MapIncidentPoint[] = supabaseItems.map((i) => ({
    id: i.id,
    latitude: i.location_lat,
    longitude: i.location_lng,
    // intensity is 1–10; normalise to 0–1 for trustScore
    trustScore: i.intensity / 10,
    category: "Suspicious Activity",
  }));

  const handlePinLocation = useCallback((pin: PinLocation | null) => {
    if (!pin) {
      setGpsPin(null);
      setDroppedPin(null);
      return;
    }
    if (pin.mode === "gps") {
      setGpsPin({ latitude: pin.latitude, longitude: pin.longitude });
    } else {
      setDroppedPin({ latitude: pin.latitude, longitude: pin.longitude });
    }
  }, []);

  const handleDropPinMode = useCallback((active: boolean) => {
    setDropPinMode(active);
  }, []);

  const handlePinDropped = useCallback((pin: DroppedPin) => {
    setDroppedPin(pin);
    setDropPinMode(false);
  }, []);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) return;

    // If we already have a fix, just recenter — no need to re-request
    if (userCoords) {
      setFlyTarget({ latitude: userCoords.latitude, longitude: userCoords.longitude, zoom: 16 });
      setLocationDenied(false);
      return;
    }

    // Attempt to get location — this re-triggers the browser permission prompt
    // even if it was previously dismissed (some browsers allow re-prompting)
    setLocating(true);
    setLocationDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFlyTarget({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, zoom: 16 });
        setLocating(false);
        setLocationDenied(false);
      },
      (err) => {
        setLocating(false);
        if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
          setLocationDenied(true);
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [userCoords]);

  const routingIncidents: SafeRouteIncident[] = useMemo(() => {
    const raw: SafeRouteIncident[] = [];
    for (const v of vicpolItems) {
      if (v.latitude == null || v.longitude == null) continue;
      raw.push({
        latitude: v.latitude,
        longitude: v.longitude,
        intensity: Math.min(10, Math.max(1, v.intensity)),
        influence_meters: 220,
      });
    }
    for (const s of supabaseItems) {
      raw.push({
        latitude: s.location_lat,
        longitude: s.location_lng,
        intensity: Math.min(10, Math.max(1, s.intensity)),
        influence_meters: 220,
      });
    }
    return capIncidents(raw);
  }, [vicpolItems, supabaseItems]);

  const requestContextualSafeRoute = useCallback(async () => {
    if (!selectedDestination) return;

    const [destLng, destLat] = selectedDestination.coordinates;
    if (!isWithinSafenetCoverage(destLng, destLat)) {
      setToastMessage(SAFENET_COVERAGE_ERROR);
      return;
    }

    setRouteLoading(true);
    setRouteError(null);
    setRouteInfo(null);
    setToastMessage(null);

    const useCustomStart = directionsMode && routeStartCustom !== null;
    let originLat: number;
    let originLng: number;

    if (useCustomStart && routeStartCustom) {
      const [slng, slat] = routeStartCustom.coordinates;
      if (!isWithinSafenetCoverage(slng, slat)) {
        setRouteLoading(false);
        setRouteLoadingPhase(null);
        setToastMessage(SAFENET_COVERAGE_ERROR);
        return;
      }
      originLat = slat;
      originLng = slng;
      setRouteLoadingPhase("route");
    } else {
      setRouteLoadingPhase(userCoords ? "route" : "location");
      if (userCoords) {
        originLat = userCoords.latitude;
        originLng = userCoords.longitude;
      } else {
        try {
          const p = await getCurrentPositionBestEffort({ mode: "routing" });
          originLat = p.latitude;
          originLng = p.longitude;
        } catch {
          if (!mapCenter) {
            setRouteLoading(false);
            setRouteLoadingPhase(null);
            setRouteError(
              "Could not get your location in time. Pan the map so your starting area is visible, then try again — or enable location permission."
            );
            return;
          }
          originLat = mapCenter.latitude;
          originLng = mapCenter.longitude;
          setRouteInfo(
            "GPS timed out — this route starts from the map center. Pan the map if needed, or enable location for your position."
          );
        }
      }
      if (!isWithinSafenetCoverage(originLng, originLat)) {
        setRouteLoading(false);
        setRouteLoadingPhase(null);
        setToastMessage(SAFENET_COVERAGE_ERROR);
        return;
      }
      setRouteLoadingPhase("route");
    }

    try {
      const engineMode = readSafeRouteEngineMode();
      let usedClientEngine = false;

      if (engineMode === "client" || engineMode === "hybrid") {
        let clientPath: [number, number][] | null = null;
        try {
          clientPath = computeClientSafeRoute(
            { latitude: originLat, longitude: originLng },
            { latitude: destLat, longitude: destLng },
            routingIncidents,
          );
        } catch {
          throw new Error("__UNROUTABLE__");
        }
        if (clientPath) {
          setSafeRouteData(clientPath);
          usedClientEngine = true;
          if (engineMode === "client") {
            return;
          }
        } else if (engineMode === "client") {
          throw new Error("__UNROUTABLE__");
        }
      }

      if (engineMode === "server" || (engineMode === "hybrid" && !usedClientEngine)) {
        const res = await fetch("/api/safe-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { latitude: originLat, longitude: originLng },
            destination: { latitude: destLat, longitude: destLng },
            incident_points: routingIncidents,
            mapbox_profile: "walking",
            heat_penalty: 14,
            grid_resolution_meters: 120,
            padding_meters: 320,
          }),
          signal:
            typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
              ? AbortSignal.timeout(55_000)
              : undefined,
        });

        let data: SafeRouteResponse & {
          detail?: unknown;
          hint?: string;
          attemptedUrl?: string;
          steps?: string[];
        };
        try {
          data = (await res.json()) as typeof data;
        } catch {
          throw new Error("__UNROUTABLE__");
        }

        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("__UNROUTABLE__");
          }
          const d = data.detail;
          let msg =
            typeof d === "string"
              ? d
              : Array.isArray(d)
                ? d.map((x: { msg?: string }) => x?.msg ?? "").filter(Boolean).join("; ")
                : "Route request failed";
          const extra: string[] = [];
          if (typeof data.hint === "string") extra.push(data.hint);
          if (typeof data.attemptedUrl === "string") extra.push(`URL: ${data.attemptedUrl}`);
          if (Array.isArray(data.steps)) extra.push(...data.steps);
          if (extra.length) msg = [msg, ...extra].join(" ");
          throw new Error(msg.trim() || "Route request failed");
        }
        const line = responseToLineFeature(data);
        setSafeRouteData(line.geometry.coordinates as [number, number][]);
      }
    } catch (e) {
      setSafeRouteData(null);
      if (e instanceof Error && e.message === "__UNROUTABLE__") {
        setToastMessage(SAFENET_UNROUTABLE_ERROR);
        setRouteError(null);
        return;
      }
      const aborted =
        (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "TimeoutError") ||
        (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      if (aborted) {
        setRouteError(
          "Route request timed out (55s). Try again, set NEXT_PUBLIC_SAFE_ROUTE_ENGINE=client for instant local routing, or check the Python router logs (OSM download can be slow)."
        );
        return;
      }
      const raw = e instanceof Error ? e.message : "";
      if (/no path|not found|404/i.test(raw)) {
        setToastMessage(SAFENET_UNROUTABLE_ERROR);
        setRouteError(null);
        return;
      }
      setRouteError(raw || "Could not compute route");
    } finally {
      setRouteLoading(false);
      setRouteLoadingPhase(null);
    }
  }, [userCoords, mapCenter, selectedDestination, routingIncidents, directionsMode, routeStartCustom]);

  const closeDestinationCard = useCallback(() => {
    setSelectedDestination(null);
    setSafeRouteData(null);
    setRouteError(null);
    setRouteInfo(null);
    setRouteLoadingPhase(null);
    setDirectionsMode(false);
    setRouteStartCustom(null);
  }, []);

  const endContextualRoute = useCallback(() => {
    setSafeRouteData(null);
    setSelectedDestination(null);
    setRouteError(null);
    setRouteInfo(null);
    setRouteLoadingPhase(null);
    setRouteStartCustom(null);
  }, []);

  const closeDirectionsPlanner = useCallback(() => {
    setDirectionsMode(false);
    setRouteStartCustom(null);
    setRouteError(null);
    setRouteInfo(null);
  }, []);

  function activeMapPoints(): MapIncidentPoint[] {
    if (activeIncidentTab === "user-reported") return [];
    if (activeIncidentTab === "official") return [...supabaseMapPoints, ...vicpolMapPoints];
    return supabaseMapPoints;
  }

  const contextualDestinationMarker = useMemo(() => {
    if (!selectedDestination) return null;
    const [lng, lat] = selectedDestination.coordinates;
    return { name: selectedDestination.name, lng, lat };
  }, [selectedDestination]);

  const contextualOriginMarker = useMemo(() => {
    if (!directionsMode || !routeStartCustom) return null;
    const [lng, lat] = routeStartCustom.coordinates;
    return { name: routeStartCustom.name, lng, lat };
  }, [directionsMode, routeStartCustom]);

  const hasContextualRoute =
    Array.isArray(safeRouteData) && safeRouteData.length >= 2;

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <RouteToast message={toastMessage} variant="error" onDismiss={dismissToast} />

      <div className="absolute inset-0 z-0">
        <RadiantMap
          onFlyTo={flyTarget}
          reports={activeMapPoints()}
          onCenterChange={setMapCenter}
          dropPinMode={dropPinMode}
          onPinDropped={handlePinDropped}
          gpsPin={gpsPin}
          droppedPin={droppedPin}
          userLocation={userCoords ? { latitude: userCoords.latitude, longitude: userCoords.longitude } : null}
          sosAlerts={sosMapAlerts}
          friendLocations={friendLocations}
          activeRoute={activeRoute}
          contextualDestination={contextualDestinationMarker}
          contextualOrigin={contextualOriginMarker}
          contextualRouteCoordinates={safeRouteData}
        />
      </div>

      {directionsMode && (
        <RoutePlannerPanel
          mapCenter={mapCenter}
          hasUserLocation={Boolean(userCoords)}
          hasActiveRoute={hasContextualRoute}
          onEndRoute={endContextualRoute}
          routeStartCustom={routeStartCustom}
          onRouteStartCustomChange={setRouteStartCustom}
          routeEnd={selectedDestination}
          onRouteEndChange={setSelectedDestination}
          routeLoading={routeLoading}
          routeLoadingPhase={routeLoadingPhase}
          routeError={routeError}
          routeInfo={routeInfo}
          onGetSafeRoute={requestContextualSafeRoute}
          onClose={closeDirectionsPlanner}
        />
      )}

      {!directionsMode && (
        <ContextualDirectionsCards
          selectedDestination={selectedDestination}
          hasActiveRoute={hasContextualRoute}
          routeLoading={routeLoading}
          routeLoadingPhase={routeLoadingPhase}
          routeError={routeError}
          routeInfo={routeInfo}
          onGetSafeRoute={requestContextualSafeRoute}
          onCloseDestination={closeDestinationCard}
          onEndRoute={endContextualRoute}
        />
      )}

      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Left panel — SOS in the Area (and all SOS sheets) */}
        <div className="pointer-events-auto absolute left-0 top-[92px] z-40">
          <SOSController
            userCoords={userCoords}
            onFlyTo={setFlyTarget}
            onAlertsChange={setSosMapAlerts}
            onAlertResolved={(alertId) =>
              setSosMapAlerts((prev) => prev.filter((a) => a.id !== alertId))
            }
            open={showSOSSheet}
            onOpenChange={setShowSOSSheet}
          />
        </div>

        <div className="pointer-events-auto absolute right-0 top-[92px] z-40 sm:right-1">
          <AreaIncidentSummary
            center={mapCenter ?? { latitude: -37.8136, longitude: 144.9631, zoom: 13 }}
            vicpolItems={vicpolItems}
            supabaseItems={supabaseItems}
            active={activeIncidentTab === "official"}
          />
        </div>

        <TopNav
          reputation={currentUser}
          user={authUser}
          mapCenter={mapCenter}
          activeIncidentTab={activeIncidentTab}
          onIncidentTabChange={setActiveIncidentTab}
          onSearchSelectArea={handleSelectArea}
          onLoginClick={() => {}}
          onSignupClick={() => {}}
          onLogout={handleLogout}
          directionsMode={directionsMode}
          onDirectionsModeChange={(active) => {
            setDirectionsMode(active);
            if (!active) setRouteStartCustom(null);
            setRouteError(null);
            setRouteInfo(null);
          }}
        />

        {/* Bottom crime-news sheet (no left-side toggle) */}
        <NewsIncidentFeed
          items={vicpolItems.map((i) => ({
            id: i.id,
            outlet: "Victoria Police",
            title: i.title,
            url: i.url,
            publishedAt: null,
            areaName: i.suburb,
            latitude: i.latitude,
            longitude: i.longitude,
          }))}
          onViewMap={(coords) => setFlyTarget(coords)}
        />

        {/* User Reported empty state */}
        {activeIncidentTab === "user-reported" && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-radiant-border bg-radiant-surface/90 px-6 py-5 text-center shadow-xl backdrop-blur-xl">
              <span className="text-2xl">📍</span>
              <p className="text-sm font-semibold text-gray-200">No user reports yet</p>
              <p className="text-xs text-gray-500">Be the first to report an incident in your area.</p>
            </div>
          </div>
        )}
      </div>

      <QuickReportFAB
        onPinLocation={handlePinLocation}
        onDropPinMode={handleDropPinMode}
        droppedPin={droppedPin}
        onSOSPress={() => setShowSOSSheet(true)}
      />

      {/* Feature controllers — self-contained, each owns its own UI and data */}
      <FindMyController
        userCoords={userCoords}
        onFriendLocationsChange={setFriendLocations}
      />
      <DirectionsController
        userCoords={userCoords}
        onRouteChange={setActiveRoute}
      />

      {/* Locate-me button — bottom-left, always clickable */}
      <button
        onClick={handleLocateMe}
        title={
          locating
            ? "Requesting your location…"
            : userCoords
            ? "Centre map on your location"
            : locationPermission === "denied" || locationDenied
            ? "Tap to retry — you may need to unblock location in your browser"
            : "Enable current location"
        }
        className={cn(
          "pointer-events-auto fixed bottom-6 left-6 z-50 flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition-all hover:scale-105 active:scale-95",
          locating
            ? "border-radiant-border bg-radiant-surface/90 text-gray-300"
            : locationDenied
            ? "border-amber-500/60 bg-radiant-surface/90 text-amber-400 hover:border-amber-400 shadow-amber-500/20"
            : userCoords
            ? "border-cyan-500/40 bg-radiant-surface/90 text-cyan-400 hover:border-cyan-400 shadow-cyan-500/20"
            : "border-radiant-border bg-radiant-surface/90 text-gray-300 hover:border-gray-500 hover:text-white"
        )}
        aria-label="Locate me"
      >
        {locating ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : locationDenied ? (
          <LocateOff className="h-5 w-5" />
        ) : (
          <LocateFixed className={cn("h-5 w-5", userCoords && "drop-shadow-[0_0_6px_rgba(34,211,238,0.7)]")} />
        )}
      </button>

      {/* Location denied banner */}
      {locationDenied && (
        <div className="pointer-events-auto fixed bottom-[72px] left-6 z-50 w-72 rounded-2xl border border-amber-500/30 bg-radiant-surface/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-amber-300">Location access blocked</p>
            <button
              onClick={() => setLocationDenied(false)}
              className="rounded p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Dismiss"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-gray-400">
            To enable your location, click the{" "}
            <span className="font-semibold text-gray-200">lock icon</span> in your browser&apos;s address bar, set <span className="font-semibold text-gray-200">Location</span> to Allow, then tap the button again.
          </p>
        </div>
      )}

      {vicpolLoading && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-5 pb-6">
          <div className="flex items-center gap-2 rounded-2xl bg-radiant-surface/90 px-5 py-3 text-sm font-semibold text-gray-300 shadow-lg backdrop-blur-xl">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-radiant-red border-t-transparent" />
            Loading incidents…
          </div>
        </div>
      )}

      <AuthModal
        isOpen={modalState !== "closed"}
        onClose={() => setModalState("closed")}
        onAuth={handleAuth}
      />
    </main>
  );
}
