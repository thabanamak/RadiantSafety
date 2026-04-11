"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import RadiantMap, { type DroppedPin } from "@/components/RadiantMap";
import TopNav from "@/components/TopNav";
import type { AuthUser, IncidentTab } from "@/components/TopNav";
import QuickReportFAB, { type PinLocation } from "@/components/QuickReportFAB";
import AuthModal from "@/components/AuthModal";
import SafeRoutePanel from "@/components/SafeRoutePanel";
import { currentUser, MELBOURNE_CENTER } from "@/lib/mock-data";
import {
  capIncidents,
  responseToLineFeature,
  type SafeRouteIncident,
  type SafeRouteLineFeature,
  type SafeRouteResponse,
} from "@/lib/safe-route";
import type { MapIncidentPoint, UserReport } from "@/lib/types";
import NewsIncidentFeed from "@/components/NewsIncidentFeed";
import AreaIncidentSummary from "@/components/AreaIncidentSummary";

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

  const [safeRouteLine, setSafeRouteLine] = useState<SafeRouteLineFeature | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const handleViewMap = useCallback((report: UserReport) => {
    setFlyTarget({ latitude: report.latitude, longitude: report.longitude });
  }, []);

  const handleSelectArea = useCallback(
    (coords: { latitude: number; longitude: number; zoom: number }) => {
      setFlyTarget(coords);
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

  const togglePickEndOnMap = useCallback(() => {
    setDropPinMode((d) => !d);
  }, []);

  const handlePinDropped = useCallback((pin: DroppedPin) => {
    setDroppedPin(pin);
    setDropPinMode(false);
  }, []);

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

  const fetchSafeRoute = useCallback(async () => {
    if (!gpsPin || !droppedPin) return;
    setRouteLoading(true);
    setRouteError(null);
    try {
      const res = await fetch("/api/safe-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { latitude: gpsPin.latitude, longitude: gpsPin.longitude },
          destination: { latitude: droppedPin.latitude, longitude: droppedPin.longitude },
          incident_points: routingIncidents,
          mapbox_profile: "walking",
          heat_penalty: 14,
          grid_resolution_meters: 120,
          padding_meters: 320,
        }),
      });
      const data = (await res.json()) as SafeRouteResponse & {
        detail?: unknown;
        hint?: string;
      };
      if (!res.ok) {
        const d = data.detail;
        const msg =
          typeof d === "string"
            ? d
            : Array.isArray(d)
              ? d.map((x: { msg?: string }) => x?.msg ?? "").filter(Boolean).join("; ")
              : data.hint ?? "Route request failed";
        throw new Error(msg || "Route request failed");
      }
      setSafeRouteLine(responseToLineFeature(data));
    } catch (e) {
      setSafeRouteLine(null);
      setRouteError(e instanceof Error ? e.message : "Could not compute route");
    } finally {
      setRouteLoading(false);
    }
  }, [gpsPin, droppedPin, routingIncidents]);

  const clearSafeRoute = useCallback(() => {
    setSafeRouteLine(null);
    setRouteError(null);
  }, []);

  const setRouteStartFromGps = useCallback((lat: number, lng: number) => {
    setGpsPin({ latitude: lat, longitude: lng });
  }, []);

  const setRouteStartFromMapCenter = useCallback(() => {
    const c = mapCenter ?? {
      latitude: MELBOURNE_CENTER.latitude,
      longitude: MELBOURNE_CENTER.longitude,
      zoom: MELBOURNE_CENTER.zoom,
    };
    setGpsPin({ latitude: c.latitude, longitude: c.longitude });
  }, [mapCenter]);

  const setRouteStartManual = useCallback((lat: number, lng: number) => {
    setGpsPin({ latitude: lat, longitude: lng });
  }, []);

  const clearRouteStart = useCallback(() => {
    setGpsPin(null);
  }, []);

  const setRouteEndFromGps = useCallback((lat: number, lng: number) => {
    setDroppedPin({ latitude: lat, longitude: lng });
    setDropPinMode(false);
  }, []);

  const setRouteEndFromMapCenter = useCallback(() => {
    const c = mapCenter ?? {
      latitude: MELBOURNE_CENTER.latitude,
      longitude: MELBOURNE_CENTER.longitude,
      zoom: MELBOURNE_CENTER.zoom,
    };
    setDroppedPin({ latitude: c.latitude, longitude: c.longitude });
    setDropPinMode(false);
  }, [mapCenter]);

  const setRouteEndManual = useCallback((lat: number, lng: number) => {
    setDroppedPin({ latitude: lat, longitude: lng });
    setDropPinMode(false);
  }, []);

  const clearRouteEnd = useCallback(() => {
    setDroppedPin(null);
  }, []);

  useEffect(() => {
    setSafeRouteLine(null);
    setRouteError(null);
  }, [gpsPin?.latitude, gpsPin?.longitude, droppedPin?.latitude, droppedPin?.longitude]);

  function activeMapPoints(): MapIncidentPoint[] {
    if (activeIncidentTab === "user-reported") return [];
    if (activeIncidentTab === "official") return [...supabaseMapPoints, ...vicpolMapPoints];
    return supabaseMapPoints;
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0 z-0">
        <RadiantMap
          onFlyTo={flyTarget}
          reports={activeMapPoints()}
          onCenterChange={setMapCenter}
          dropPinMode={dropPinMode}
          onPinDropped={handlePinDropped}
          gpsPin={gpsPin}
          droppedPin={droppedPin}
          safeRouteLine={safeRouteLine}
        />
      </div>

      <SafeRoutePanel
        hasStart={!!gpsPin}
        hasEnd={!!droppedPin}
        canCompute={!!gpsPin && !!droppedPin}
        mapCenterReady
        dropPinMode={dropPinMode}
        loading={routeLoading}
        error={routeError}
        route={safeRouteLine}
        onSetStartFromGps={setRouteStartFromGps}
        onSetStartFromMapCenter={setRouteStartFromMapCenter}
        onSetStartManual={setRouteStartManual}
        onClearStart={clearRouteStart}
        onSetEndFromGps={setRouteEndFromGps}
        onSetEndFromMapCenter={setRouteEndFromMapCenter}
        onSetEndManual={setRouteEndManual}
        onClearEnd={clearRouteEnd}
        onTogglePickEndOnMap={togglePickEndOnMap}
        onCompute={fetchSafeRoute}
        onClear={clearSafeRoute}
      />

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute right-5 top-[92px] z-40 hidden w-[360px] lg:block">
          <AreaIncidentSummary
            className="pointer-events-auto"
            center={mapCenter ?? { latitude: -37.8136, longitude: 144.9631, zoom: 13 }}
            vicpolItems={vicpolItems}
            supabaseItems={supabaseItems}
            active={activeIncidentTab === "official"}
          />
        </div>

        <TopNav
          reputation={currentUser}
          user={authUser}
          reports={[]}
          activeIncidentTab={activeIncidentTab}
          onIncidentTabChange={setActiveIncidentTab}
          onSearchSelectIncident={handleViewMap}
          onSearchSelectArea={handleSelectArea}
          onLoginClick={() => setModalState("login")}
          onSignupClick={() => setModalState("signup")}
          onLogout={handleLogout}
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
      />

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
