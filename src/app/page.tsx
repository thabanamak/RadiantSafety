"use client";

import { useState, useCallback, useEffect, use } from "react";
import RadiantMap, { type DroppedPin } from "@/components/RadiantMap";
import TopNav from "@/components/TopNav";
import type { AuthUser, IncidentTab } from "@/components/TopNav";
import QuickReportFAB, {
  type PinLocation,
  type SubmittedReportPayload,
} from "@/components/QuickReportFAB";
import AuthModal from "@/components/AuthModal";
import { currentUser } from "@/lib/mock-data";
import type { MapIncidentPoint, UserReport } from "@/lib/types";
import NewsIncidentFeed from "@/components/NewsIncidentFeed";
import IncidentFeed from "@/components/IncidentFeed";
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

type DashboardProps = {
  params: Promise<Record<string, string | string[] | undefined>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function Dashboard({ params, searchParams }: DashboardProps) {
  use(params);
  use(searchParams);
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

  /** In-session user submissions (Quick Report); shown under User Reported + search. */
  const [submittedUserReports, setSubmittedUserReports] = useState<UserReport[]>([]);

  // Location pin state — shared between FAB and map
  const [dropPinMode, setDropPinMode] = useState(false);
  const [droppedPin, setDroppedPin] = useState<DroppedPin | null>(null);
  const [gpsPin, setGpsPin] = useState<DroppedPin | null>(null);

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
      setDroppedPin(null);
    } else {
      setDroppedPin({ latitude: pin.latitude, longitude: pin.longitude });
      setGpsPin(null);
    }
  }, []);

  const handleDropPinMode = useCallback((active: boolean) => {
    setDropPinMode(active);
    // Do not clear droppedPin here — turning off drop mode also runs after a successful
    // map click; clearing would remove the pin. Use handlePinLocation(null) to clear.
  }, []);

  const handlePinDropped = useCallback((pin: DroppedPin) => {
    setDroppedPin(pin);
    setDropPinMode(false);
  }, []);

  const handleReportSubmitted = useCallback(
    (payload: SubmittedReportPayload) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `report-${Date.now()}`;
      const report: UserReport = {
        id,
        latitude: payload.location.latitude,
        longitude: payload.location.longitude,
        trustScore: 0.5,
        category: payload.category,
        description: payload.description.trim() || "(No description)",
        imageDataUrl: payload.imageDataUrl ?? null,
        verifiedBy: 0,
        upvotes: 0,
        downvotes: 0,
        createdAt: new Date(),
        userId: authUser?.email ?? "anonymous",
      };
      setSubmittedUserReports((prev) => [report, ...prev]);
      setActiveIncidentTab("user-reported");
      setFlyTarget({
        latitude: report.latitude,
        longitude: report.longitude,
        zoom: 16,
      });
    },
    [authUser]
  );

  const userReportedMapPoints: MapIncidentPoint[] = submittedUserReports.map((r) => ({
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    trustScore: r.trustScore,
    category: r.category,
  }));

  function activeMapPoints(): MapIncidentPoint[] {
    if (activeIncidentTab === "user-reported") return userReportedMapPoints;
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
        />
      </div>

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
          reports={submittedUserReports}
          activeIncidentTab={activeIncidentTab}
          onIncidentTabChange={setActiveIncidentTab}
          onSearchSelectIncident={handleViewMap}
          onSearchSelectArea={handleSelectArea}
          onLoginClick={() => setModalState("login")}
          onSignupClick={() => setModalState("signup")}
          onLogout={handleLogout}
        />

        {/* Bottom sheet: official = VicPol news; user-reported = community reports with full text */}
        {activeIncidentTab === "official" ? (
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
        ) : (
          <IncidentFeed
            reports={submittedUserReports}
            onViewMap={handleViewMap}
            reserveTopPx={220}
            collapsedLabel={
              submittedUserReports.length > 0
                ? `User reports (${submittedUserReports.length})`
                : "User reports"
            }
            sheetTitle="User-reported incidents"
          />
        )}

        {/* User Reported empty state — only when nothing submitted this session */}
        {activeIncidentTab === "user-reported" && submittedUserReports.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-radiant-border bg-radiant-surface/90 px-6 py-5 text-center shadow-xl backdrop-blur-xl">
              <span className="text-2xl">📍</span>
              <p className="text-sm font-semibold text-gray-200">No user reports yet</p>
              <p className="text-xs text-gray-500">
                Use the red quick-report button and set a location to add one.
              </p>
            </div>
          </div>
        )}
      </div>

      <QuickReportFAB
        onPinLocation={handlePinLocation}
        onDropPinMode={handleDropPinMode}
        droppedPin={droppedPin}
        onReportSubmitted={handleReportSubmitted}
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
