"use client";

import dynamic from "next/dynamic";
import { Suspense, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DroppedPin } from "@/components/RadiantMap";

/** Mapbox / react-map-gl touch `window` — must not SSR or the whole page can white-screen. */
const RadiantMap = dynamic(() => import("@/components/RadiantMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full min-h-0 w-full flex-1 items-center justify-center bg-[#0a0a0a] text-sm text-gray-400"
      style={{
        minHeight: "100%",
        backgroundColor: "#0a0a0a",
        color: "#9ca3af",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      Loading map…
    </div>
  ),
});
import TopNav from "@/components/TopNav";
import type { IncidentTab } from "@/components/TopNav";
import QuickReportFAB, {
  type PinLocation,
  type SubmittedReportPayload,
} from "@/components/QuickReportFAB";
import ReporterProfileModal from "@/components/ReporterProfileModal";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/identity";
import { isEmailLinkCallback } from "@/lib/auth-callback-url";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { syncProfileFromAuthUser } from "@/lib/supabase/profile-sync";
import type { AuthUser } from "@/lib/auth-storage";
import {
  clearStoredUser,
  DEFAULT_REPUTATION_SCORE,
  getStoredUser,
  setStoredUser,
} from "@/lib/auth-storage";
import type { UserReputation } from "@/lib/types";
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
import { snapRouteToStreets } from "@/lib/street-snap";
import type { MapIncidentPoint, UserReport } from "@/lib/types";
import { getSeverityForCategory } from "@/lib/category-severity";
import NewsIncidentFeed from "@/components/NewsIncidentFeed";
import IncidentFeed from "@/components/IncidentFeed";
import AreaIncidentSummary from "@/components/AreaIncidentSummary";
import type { SOSAlert } from "@/components/SOSAreaPanel";
import type { FriendLocation } from "@/components/RadiantMap";
import SOSController from "@/features/sos/SOSController";
import IncomingSOSBanner, { type IncomingSOS } from "@/components/IncomingSOSBanner";
import SafeWalkTimer from "@/components/SafeWalkTimer";
import HotspotNudge from "@/components/HotspotNudge";
import FindMyController from "@/features/find-my/FindMyController";
import DirectionsController from "@/features/directions/DirectionsController";
import { VIC_HEALTH_FACILITIES } from "@/lib/vic-health-facilities";
import { VIC_POLICE_STATIONS } from "@/lib/vic-police-stations";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { LocateFixed, LocateOff, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { IntensityFilter, DataSourceFilter } from "@/lib/map-crime-intensity-filter";
import {
  deleteUserReport,
  fetchUserReports,
  insertUserReport,
  mergeUserReports,
  toggleUserReportVote,
} from "@/lib/supabase-user-reports";
import { computeTrustPoints, getTrustDisplayText } from "@/lib/report-trust";
import { randomUUID } from "@/lib/uuid";

interface VicPolIncident {
  id: string;
  title: string;
  url: string;
  suburb: string | null;
  latitude: number | null;
  longitude: number | null;
  intensity: number;
  /** Normalized 0–1 (from API); map heatmap uses `intensity` 1–10. */
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

/** Safe [lng, lat] for routing — avoids destructuring undefined (Symbol.iterator crash). */
function lngLatTuple(c: unknown): [number, number] | null {
  if (!Array.isArray(c) || c.length < 2) return null;
  const lng = Number(c[0]);
  const lat = Number(c[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

function reputationForAuthUser(user: AuthUser): UserReputation {
  const score = user.reputationScore ?? DEFAULT_REPUTATION_SCORE;
  return {
    score,
    label: score >= 70 ? "Trusted" : "Community",
    isTrusted: score >= 70,
  };
}

function WelcomeBanner({ authUser }: { authUser: AuthUser | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showWelcome = searchParams.get("welcome") === "1";
  const visible = showWelcome && authUser !== null;

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => {
      router.replace("/", { scroll: false });
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [visible, router]);

  if (!visible) return null;

  return (
    <div className="pointer-events-auto absolute left-1/2 top-[72px] z-40 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl border border-emerald-500/35 bg-emerald-950/90 px-4 py-3 shadow-xl backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <p className="flex-1 text-center text-sm leading-relaxed text-emerald-50 sm:text-left">
          <span className="font-semibold text-white">
            Welcome{authUser.name ? `, ${authUser.name}` : ""}!
          </span>{" "}
          You&apos;re signed in — your reputation starts at{" "}
          {authUser.reputationScore ?? DEFAULT_REPUTATION_SCORE}. Explore the Pulse
          and map to get started.
        </p>
        <button
          type="button"
          onClick={() => router.replace("/", { scroll: false })}
          className="shrink-0 rounded-lg p-1 text-emerald-200/80 transition-colors hover:bg-emerald-900/50 hover:text-white"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export type RoutingStatus = "off" | "planning" | "active";

export default function Dashboard() {
  const pathname = usePathname();
  const router = useRouter();
  const [flyTarget, setFlyTarget] = useState<{
    latitude: number;
    longitude: number;
    zoom?: number;
  } | null>(null);

  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number; zoom: number } | null>(null);

  const [activeIncidentTab, setActiveIncidentTab] = useState<IncidentTab>("official");
  const [crimeIntensityFilter, setCrimeIntensityFilter] = useState<IntensityFilter>("all");
  const [dataSourceFilter, setDataSourceFilter] = useState<DataSourceFilter>("all");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [reporterProfile, setReporterProfile] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const canSubmitReports = Boolean(
    authUser?.id && authUser.over18Verified !== false
  );

  const [vicpolLoaded, setVicpolLoaded] = useState(false);
  const [vicpolLoading, setVicpolLoading] = useState(false);
  const [vicpolItems, setVicpolItems] = useState<VicPolIncident[]>([]);

  const [supabaseItems, setSupabaseItems] = useState<SupabaseIncident[]>([]);

  /** Loaded from `user_reports` + any optimistic rows not yet in DB. */
  const [submittedUserReports, setSubmittedUserReports] = useState<UserReport[]>([]);
  const [userReportsHydrated, setUserReportsHydrated] = useState(false);
  /** User-reported sheet: show only rows filed by the signed-in user. */
  const [showOnlyMyUserReports, setShowOnlyMyUserReports] = useState(false);

  useEffect(() => {
    if (!authUser?.id) setShowOnlyMyUserReports(false);
  }, [authUser?.id]);

  const displayedUserReports = useMemo(() => {
    if (!showOnlyMyUserReports || !authUser?.id) return submittedUserReports;
    const uid = authUser.id.trim().toLowerCase();
    return submittedUserReports.filter((r) => {
      const rid = (r.reporterId || r.userId || "").trim().toLowerCase();
      return rid === uid;
    });
  }, [submittedUserReports, showOnlyMyUserReports, authUser?.id]);

  const loadUserReports = useCallback(async () => {
    const { client } = getSupabaseBrowserClient();
    if (!client) {
      setUserReportsHydrated(true);
      return;
    }
    const self =
      authUser?.id != null
        ? { id: authUser.id, name: authUser.name ?? "" }
        : null;
    const rows = await fetchUserReports(client, { self });
    setSubmittedUserReports((prev) => mergeUserReports(rows, prev));
    setUserReportsHydrated(true);
  }, [authUser?.id, authUser?.name]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadUserReports();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadUserReports]);

  // Realtime: merge vote/trust changes on `user_reports` (and drop rows removed by DB triggers).
  useEffect(() => {
    const { client } = getSupabaseBrowserClient();
    if (!client) return;
    const channel = client
      .channel("user_reports_votes_realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_reports" },
        (payload) => {
          const row = payload.new as {
            id?: string;
            upvotes?: number;
            downvotes?: number;
            trust?: number;
            trust_label?: string | null;
          };
          if (
            !row?.id ||
            typeof row.upvotes !== "number" ||
            typeof row.downvotes !== "number"
          ) {
            return;
          }
          const reportId = row.id;
          const upvotes = row.upvotes;
          const downvotes = row.downvotes;
          const trustPoints =
            typeof row.trust === "number" && Number.isFinite(row.trust)
              ? row.trust
              : computeTrustPoints(upvotes, downvotes);
          const trustLabel =
            typeof row.trust_label === "string" && row.trust_label.trim() !== ""
              ? row.trust_label
              : getTrustDisplayText(trustPoints);
          setSubmittedUserReports((prev) =>
            prev.map((r) =>
              r.id === reportId
                ? {
                    ...r,
                    upvotes,
                    downvotes,
                    trustPoints,
                    trustLabel,
                  }
                : r
            )
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "user_reports" },
        (payload) => {
          const oldRow = payload.old as { id?: string };
          if (!oldRow?.id) return;
          setSubmittedUserReports((prev) => prev.filter((r) => r.id !== oldRow.id));
        }
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  // Location pin state — shared between FAB and map
  const [dropPinMode, setDropPinMode] = useState(false);
  const [droppedPin, setDroppedPin] = useState<DroppedPin | null>(null);
  const [gpsPin, setGpsPin] = useState<DroppedPin | null>(null);

  // Live device location (Phase 3) — "you are here" cyan dot
  const { coords: userCoords, permission: locationPermission } = useUserLocation();
  const hasCenteredOnUser = useRef(false);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  /** Only set in useEffect so SSR and first client paint match (avoids hydration mismatch on `navigator`). */
  const [geolocationApiMissing, setGeolocationApiMissing] = useState(false);

  useEffect(() => {
    setGeolocationApiMissing(typeof navigator === "undefined" || !navigator.geolocation);
  }, []);

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
  const [findMyOpen, setFindMyOpen] = useState(false);
  // Only one left-edge panel open at a time
  const [sosAreaOpen, setSosAreaOpen] = useState(false);
  const [showSafeWalk, setShowSafeWalk] = useState(false);
  const [showHotspotNudge, setShowHotspotNudge] = useState(false);
  const nudgeDismissedUntil = useRef<number>(0);
  const [sosMapAlerts, setSosMapAlerts] = useState<SOSAlert[]>([]);
  // Incoming SOS banner — SafeWalk etc. inserts into active_sos; only verified first responders get the ping
  const [incomingSOS, setIncomingSOS] = useState<IncomingSOS | null>(null);

  /** Nearby SOS + active_sos banner: only after in-app First Responder verification (`profiles.is_responder`). */
  const canReceiveSOSPings = Boolean(authUser?.isResponder);

  useEffect(() => {
    if (!canReceiveSOSPings) {
      setIncomingSOS(null);
      return;
    }
    const { client } = getSupabaseBrowserClient();
    if (!client) return;
    const channel = client
      .channel("public:active_sos")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "active_sos" },
        (payload) => {
          const row = payload.new as {
            user_id: string;
            lng: number;
            lat: number;
            created_at: string;
          };
          // Don't show the banner to the person who triggered it (e.g. their own SafeWalk expiry)
          if (row.user_id === getDeviceId()) return;
          setIncomingSOS({
            friendName: "User " + row.user_id.substring(0, 4),
            coordinates: [row.lng, row.lat],
            time: new Date(row.created_at).toLocaleTimeString(),
          });
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [canReceiveSOSPings]);

  useEffect(() => {
    if (!canReceiveSOSPings) {
      setSosMapAlerts([]);
    }
  }, [canReceiveSOSPings]);

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

  useEffect(() => {
    if (pathname === "/") {
      setAuthUser(getStoredUser());
    }
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/") return;
    let cancelled = false;
    const { client, error } = getSupabaseBrowserClient();
    if (error || !client) return;
    const supabase = client;

    async function applySession(session: Session | null) {
      if (cancelled) return;
      if (!session?.user) {
        if (typeof window !== "undefined" && isEmailLinkCallback()) {
          return;
        }
        if (getStoredUser()?.id) {
          clearStoredUser();
          setAuthUser(null);
        }
        return;
      }
      try {
        const u = await syncProfileFromAuthUser(supabase, session.user);
        if (cancelled) return;
        setStoredUser(u);
        setAuthUser(u);
        if (
          typeof window !== "undefined" &&
          (isEmailLinkCallback() || window.location.hash.length > 1)
        ) {
          router.replace("/?welcome=1", { scroll: false });
        }
      } catch (e) {
        console.error(e);
      }
    }

    void supabase.auth.getSession().then((res: { data: { session: Session | null } }) => {
      void applySession(res.data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        void applySession(session);
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  const routingStatus: RoutingStatus = safeRouteData
    ? "active"
    : gpsPin || droppedPin || dropPinMode
      ? "planning"
      : "off";

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

  const handleLogout = useCallback(async () => {
    const { client } = getSupabaseBrowserClient();
    if (client) {
      await client.auth.signOut();
    }
    clearStoredUser();
    setAuthUser(null);
    router.replace("/", { scroll: false });
  }, [router]);

  const handleAuthUserPatch = useCallback((patch: Partial<AuthUser>) => {
    setAuthUser((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...patch };
      setStoredUser(next);
      return next;
    });
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

  const vicpolMapPoints: MapIncidentPoint[] = useMemo(
    () =>
      vicpolItems
        .filter((i) => i.latitude != null && i.longitude != null)
        .map((i) => ({
          id: i.id,
          latitude: i.latitude as number,
          longitude: i.longitude as number,
          intensity: i.intensity,
          category: "Suspicious Behavior",
        })),
    [vicpolItems]
  );

  const supabaseMapPoints: MapIncidentPoint[] = useMemo(
    () =>
      supabaseItems.map((i) => ({
        id: i.id,
        latitude: i.location_lat,
        longitude: i.location_lng,
        intensity: i.intensity,
        category: "Suspicious Behavior",
      })),
    [supabaseItems]
  );

  const officialCombinedMapPoints = useMemo(
    () => [...supabaseMapPoints, ...vicpolMapPoints],
    [supabaseMapPoints, vicpolMapPoints]
  );

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
    // Do not clear droppedPin here — turning off drop mode also runs after a successful
    // map click; clearing would remove the pin. Use handlePinLocation(null) to clear.
  }, []);

  const handlePinDropped = useCallback((pin: DroppedPin) => {
    setDroppedPin(pin);
    setDropPinMode(false);
  }, []);

  const handleReportSubmitted = useCallback(
    async (payload: SubmittedReportPayload) => {
      if (!authUser?.id) {
        router.push("/login");
        return;
      }
      if (authUser.over18Verified === false) {
        router.push("/signup");
        return;
      }
      let id = randomUUID();

      const { client } = getSupabaseBrowserClient();
      let inserted = false;
      if (client) {
        const result = await insertUserReport(client, {
          category: payload.category,
          description: payload.description.trim() || "(No description)",
          latitude: payload.location.latitude,
          longitude: payload.location.longitude,
          imageUrl: null,
        });
        if (result.id) {
          id = result.id;
          inserted = true;
        } else {
          console.warn(
            "[RadiantSafety] user_reports insert skipped or failed:",
            "error" in result ? result.error : ""
          );
        }
      }

      if (inserted) {
        await loadUserReports();
      } else {
        const rid = authUser.id ?? authUser.email;
        const rname = authUser.name;
        const report: UserReport = {
          id,
          latitude: payload.location.latitude,
          longitude: payload.location.longitude,
          trustPoints: 10,
          trustLabel: getTrustDisplayText(10),
          myVote: null,
          category: payload.category,
          description: payload.description.trim() || "(No description)",
          imageDataUrl: payload.imageDataUrl ?? null,
          verifiedBy: 0,
          upvotes: 0,
          downvotes: 0,
          createdAt: new Date(),
          userId: rid,
          reporterId: rid,
          reporterDisplayName: rname,
        };
        setSubmittedUserReports((prev) => mergeUserReports([report], prev));
      }
      setActiveIncidentTab("user-reported");
      setFlyTarget({
        latitude: payload.location.latitude,
        longitude: payload.location.longitude,
        zoom: 16,
      });
    },
    [authUser, router, loadUserReports]
  );

  const handleDeleteReport = useCallback(
    async (reportId: string) => {
      const { client } = getSupabaseBrowserClient();
      if (client) {
        const result = await deleteUserReport(client, reportId);
        if (!result.ok) {
          console.warn("[RadiantSafety] user_reports delete failed:", result.error);
          return;
        }
      }
      setSubmittedUserReports((prev) => prev.filter((r) => r.id !== reportId));
    },
    []
  );

  const handleVoteReport = useCallback(
    async (reportId: string, direction: "up" | "down") => {
      const { client } = getSupabaseBrowserClient();
      if (!client) return;
      const result = await toggleUserReportVote(client, reportId, direction);
      if (!result.ok) {
        console.warn("[RadiantSafety] user_reports vote failed:", result.error);
        return;
      }
      setSubmittedUserReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? {
                ...r,
                upvotes: result.upvotes,
                downvotes: result.downvotes,
                trustPoints: result.trust,
                trustLabel: result.trustLabel,
                myVote: result.myVote,
              }
            : r
        )
      );
    },
    []
  );

  const userReportedMapPoints: MapIncidentPoint[] = useMemo(
    () =>
      displayedUserReports.map((r) => ({
        id: r.id,
        latitude: r.latitude,
        longitude: r.longitude,
        intensity: getSeverityForCategory(r.category),
        trustPoints: r.trustPoints,
        category: r.category,
      })),
    [displayedUserReports]
  );

  const reportsForRadiantMap = useMemo((): MapIncidentPoint[] => {
    if (activeIncidentTab === "user-reported") return userReportedMapPoints;
    if (activeIncidentTab === "official") {
      if (dataSourceFilter === "historical") return supabaseMapPoints;
      if (dataSourceFilter === "live") return vicpolMapPoints;
      return officialCombinedMapPoints;
    }
    return supabaseMapPoints;
  }, [activeIncidentTab, userReportedMapPoints, officialCombinedMapPoints, supabaseMapPoints, vicpolMapPoints, dataSourceFilter]);

  const handleLocateMe = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setToastMessage(
        "This embedded preview cannot use GPS. Open the same URL in Chrome or Edge (e.g. http://localhost:3000) and allow location there."
      );
      return;
    }

    if (userCoords) {
      setFlyTarget({ latitude: userCoords.latitude, longitude: userCoords.longitude, zoom: 16 });
      setLocationDenied(false);
      return;
    }

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

  // Hotspot nudge — check if user has walked into a high-incident-density zone
  useEffect(() => {
    if (!userCoords || showSafeWalk) return;
    if (Date.now() < nudgeDismissedUntil.current) return;

    const { latitude, longitude } = userCoords;
    const R = 6_371_000;
    const toRad = (d: number) => (d * Math.PI) / 180;

    // Score = sum of incident intensities within 300 m
    let score = 0;
    const allPoints = officialCombinedMapPoints;
    for (const pt of allPoints) {
      const dLat = toRad(pt.latitude - latitude);
      const dLng = toRad(pt.longitude - longitude);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(latitude)) * Math.cos(toRad(pt.latitude)) * Math.sin(dLng / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (dist <= 300) score += pt.intensity ?? 1;
    }

    // Threshold: combined intensity > 15 within 300 m triggers the nudge
    setShowHotspotNudge(score > 15);
  }, [userCoords, officialCombinedMapPoints, showSafeWalk]);

  const requestContextualSafeRoute = useCallback(
    async (destinationOverride?: SelectedDestination | null) => {
    const dest = destinationOverride ?? selectedDestination;

    if (!dest) {
      console.warn("[SafeRoute] no destination set");
      setRouteError("Please search for a destination first.");
      return;
    }

    const destPair = lngLatTuple(dest.coordinates);
    if (!destPair) {
      console.warn("[SafeRoute] destination has no valid coordinates", dest);
      setRouteError("That place is missing map coordinates. Choose it again from search or directions.");
      return;
    }
    const [destLng, destLat] = destPair;
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
      const startPair = lngLatTuple(routeStartCustom.coordinates);
      if (!startPair) {
        setRouteLoading(false);
        setRouteLoadingPhase(null);
        setRouteError("Start location is missing coordinates. Pick the start again from search.");
        return;
      }
      const [slng, slat] = startPair;
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
        } catch (geoErr) {
          console.warn("[SafeRoute] GPS failed:", geoErr);
          // Fall back to map center, then Melbourne CBD
          if (mapCenter) {
            originLat = mapCenter.latitude;
            originLng = mapCenter.longitude;
            setRouteInfo(
              "GPS unavailable — this route starts from the map center. Enable location for your position."
            );
          } else {
            // Last resort: Melbourne CBD
            originLat = -37.8136;
            originLng = 144.9631;
            setRouteInfo(
              "GPS unavailable — route starts from Melbourne CBD. Enable location for your position."
            );
          }
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

    console.log("[SafeRoute] routing", {
      origin: { lat: originLat, lng: originLng },
      dest: { lat: destLat, lng: destLng },
    });

    try {
      const engineMode = readSafeRouteEngineMode();
      let clientPathComputed = false;
      let clientPath: [number, number][] | null = null;
      let clientPathHeats: number[] | undefined;
      let clientEntersHazard = false;
      let snapPromise: Promise<[number, number][] | null> | null = null;

      if (engineMode === "client" || engineMode === "hybrid") {
        try {
          const clientResult = computeClientSafeRoute(
            { latitude: originLat, longitude: originLng },
            { latitude: destLat, longitude: destLng },
            routingIncidents,
          );
          if (clientResult) {
            clientPath = clientResult.path;
            clientPathHeats = clientResult.pathHeats;
            clientEntersHazard = clientResult.entersHazardZone;
          }
          console.log("[SafeRoute] client A* result:", clientPath ? `${clientPath.length} points` : "null", "hazard:", clientEntersHazard);
        } catch (astarErr) {
          console.warn("[SafeRoute] client A* threw:", astarErr);
          if (engineMode === "client") throw new Error("__UNROUTABLE__");
        }
        if (clientPath) {
          clientPathComputed = true;
          snapPromise = snapRouteToStreets(clientPath, clientPathHeats);
          if (engineMode === "client") {
            const snapped = await snapPromise;
            setSafeRouteData(snapped ?? clientPath);
            if (clientEntersHazard) setShowSafeWalk(true);
            return;
          }
        } else if (engineMode === "client") {
          throw new Error("__UNROUTABLE__");
        }
      }

      if (engineMode === "server" || engineMode === "hybrid") {
        type ServerRoutePayload = SafeRouteResponse & {
          error_code?: string;
          detail?: unknown;
          hint?: string;
          attemptedUrl?: string;
          steps?: string[];
        };

        const backendUnavailable = (d: ServerRoutePayload) =>
          d.error_code === "BACKEND_UNAVAILABLE" || d.error_code === "BACKEND_NOT_CONFIGURED";

        const fetchSafeRouteFromApi = async (): Promise<{ res: Response; data: ServerRoutePayload }> => {
          const res = await fetch("/api/safe-route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              origin: { latitude: originLat, longitude: originLng },
              destination: { latitude: destLat, longitude: destLng },
              incident_points: routingIncidents,
              mapbox_profile: "walking",
              heat_penalty: 40,
              grid_resolution_meters: 60,
              padding_meters: 320,
            }),
            signal:
              typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
                ? AbortSignal.timeout(55_000)
                : undefined,
          });
          let data: ServerRoutePayload;
          try {
            data = (await res.json()) as ServerRoutePayload;
          } catch {
            console.warn("[SafeRoute] server response not JSON");
            throw new Error("__UNROUTABLE__");
          }
          return { res, data };
        };

        try {
          // Hybrid: run Mapbox street-snap and /api/safe-route in parallel so we
          // do not wait for a slow or unreachable Python router before showing a
          // route (localhost often has Python; Vercel usually does not).
          if (engineMode === "hybrid" && snapPromise && clientPathComputed) {
            const [snapSettled, serverSettled] = await Promise.allSettled([
              snapPromise,
              fetchSafeRouteFromApi(),
            ]);

            let hybridSnapInfo: string | undefined;

            if (serverSettled.status === "fulfilled") {
              const { res, data } = serverSettled.value;
              console.log("[SafeRoute] server response:", res.status, data.error_code ?? "ok");

              if (res.ok) {
                try {
                  const line = responseToLineFeature(data);
                  const serverCoords = line.geometry.coordinates;
                  if (Array.isArray(serverCoords) && serverCoords.length >= 2) {
                    setSafeRouteData(serverCoords as [number, number][]);
                    if (clientEntersHazard) setShowSafeWalk(true);
                    return;
                  }
                } catch {
                  /* fall through to street-snapped client */
                }
                hybridSnapInfo = "Showing street-snapped route — server returned invalid geometry.";
              } else if (res.status === 503 && backendUnavailable(data)) {
                hybridSnapInfo =
                  data.error_code === "BACKEND_NOT_CONFIGURED"
                    ? "Showing street-snapped route — no server router URL on this deployment."
                    : "Showing street-snapped route — Python routing service is offline.";
              }
            } else {
              console.warn("[SafeRoute] server fetch failed:", serverSettled.reason);
            }

            const snapped =
              snapSettled.status === "fulfilled" ? snapSettled.value : null;
            if (!snapped) {
              if (clientPath && clientPath.length >= 2) {
                setSafeRouteData(clientPath);
                setRouteInfo("Showing grid route — could not snap to streets (Mapbox directions).");
                return;
              }
              if (serverSettled.status === "rejected") {
                const r = serverSettled.reason;
                if (r instanceof Error && r.name === "AbortError") {
                  setRouteError("Route request timed out. Try again or check your connection.");
                } else {
                  setRouteError("Could not compute route.");
                }
                return;
              }
              setRouteError("Could not compute route. Enable location and try again.");
              return;
            }

            if (!hybridSnapInfo) {
              if (serverSettled.status === "rejected") {
                const r = serverSettled.reason;
                hybridSnapInfo =
                  r instanceof Error && r.name === "AbortError"
                    ? "Showing street-snapped route — routing service timed out."
                    : "Showing street-snapped route — server upgrade unavailable.";
              } else if (serverSettled.status === "fulfilled") {
                const { res } = serverSettled.value;
                if (res.ok) {
                  hybridSnapInfo = "Showing street-snapped route — server returned invalid geometry.";
                } else if (!(res.status === 503 && backendUnavailable(serverSettled.value.data))) {
                  hybridSnapInfo = "Showing street-snapped route — server upgrade unavailable.";
                }
              }
            }
            if (hybridSnapInfo) setRouteInfo(hybridSnapInfo);
            setSafeRouteData(snapped);
            return;
          }

          const { res, data } = await fetchSafeRouteFromApi();
          console.log("[SafeRoute] server response:", res.status, data.error_code ?? "ok");

          if (!res.ok) {
            if (res.status === 503 && backendUnavailable(data)) {
              if (clientPathComputed) {
                setRouteInfo(
                  data.error_code === "BACKEND_NOT_CONFIGURED"
                    ? "Showing street-snapped route — no server router URL on this deployment."
                    : "Showing street-snapped route — Python routing service is offline.",
                );
                const snapped = snapPromise ? await snapPromise : null;
                const fallback = snapped ?? clientPath;
                if (fallback && fallback.length >= 2) {
                  setSafeRouteData(fallback);
                } else {
                  setRouteError("Could not compute route. Enable location and try again.");
                }
                return;
              }
              throw new Error("__BACKEND_UNAVAILABLE__");
            }
            if (res.status === 404) throw new Error("__UNROUTABLE__");
            const d = data.detail;
            let msg =
              typeof d === "string"
                ? d
                : Array.isArray(d)
                  ? d.map((x: { msg?: string }) => x?.msg ?? "").filter(Boolean).join("; ")
                  : "Route request failed";
            if (typeof data.hint === "string") msg = [msg, data.hint].join(" ");
            throw new Error(msg.trim() || "Route request failed");
          }

          const line = responseToLineFeature(data);
          const serverCoords = line.geometry.coordinates;
          if (!Array.isArray(serverCoords) || serverCoords.length < 2) {
            throw new Error("__UNROUTABLE__");
          }
          setSafeRouteData(serverCoords as [number, number][]);
          if (clientEntersHazard) setShowSafeWalk(true);
        } catch (serverErr) {
          console.warn("[SafeRoute] server error:", serverErr);
          if (engineMode === "hybrid" && clientPathComputed) {
            const snapped = snapPromise ? await snapPromise : null;
            if (!snapped) {
              if (clientPath && clientPath.length >= 2) {
                setSafeRouteData(clientPath);
                setRouteInfo("Showing grid route — could not snap to streets (Mapbox directions).");
                return;
              }
              if (serverErr instanceof Error && serverErr.name === "AbortError") {
                setRouteError("Route request timed out. Try again or check your connection.");
              } else if (
                serverErr instanceof Error &&
                (serverErr.message === "__BACKEND_UNAVAILABLE__" ||
                  serverErr.message.includes("ECONNREFUSED"))
              ) {
                setRouteError(
                  "Python routing service is offline. Set NEXT_PUBLIC_SAFE_ROUTE_ENGINE=client in your environment to use in-browser routing.",
                );
              } else {
                setRouteError("Could not compute route.");
              }
              return;
            }
            setSafeRouteData(snapped);
            if (serverErr instanceof Error && serverErr.name === "AbortError") {
              setRouteInfo("Showing street-snapped route — routing service timed out.");
            } else if (
              serverErr instanceof Error &&
              (serverErr.message === "__BACKEND_UNAVAILABLE__" ||
                serverErr.message.includes("ECONNREFUSED"))
            ) {
              setRouteInfo("Showing street-snapped route — Python routing service is offline.");
            } else {
              setRouteInfo("Showing street-snapped route — server upgrade unavailable.");
            }
            return;
          }
          throw serverErr;
        }
      }
    } catch (e) {
      console.error("[SafeRoute] unhandled error:", e);
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
        setRouteError("Route request timed out. Try again or check your connection.");
        return;
      }
      if (e instanceof Error && e.message === "__BACKEND_UNAVAILABLE__") {
        setRouteError("Python routing service is offline. Set NEXT_PUBLIC_SAFE_ROUTE_ENGINE=client in your environment to use in-browser routing.");
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
    },
    [userCoords, mapCenter, selectedDestination, routingIncidents, directionsMode, routeStartCustom]
  );

  /** Verified responder routing to a live SOS pin (Mapbox + server safe-route / client A*). */
  const requestRouteToSosLocation = useCallback(
    (latitude: number, longitude: number) => {
      const dest: SelectedDestination = {
        name: "SOS — live location",
        coordinates: [longitude, latitude],
      };
      // Close the directions planner if open so ContextualDirectionsCards renders
      setDirectionsMode(false);
      setRouteStartCustom(null);
      setSelectedDestination(dest);
      setFlyTarget({ latitude, longitude, zoom: 16 });
      void requestContextualSafeRoute(dest);
    },
    [requestContextualSafeRoute]
  );

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

  const contextualDestinationMarker = useMemo(() => {
    if (!selectedDestination) return null;
    const pair = lngLatTuple(selectedDestination.coordinates);
    if (!pair) return null;
    const [lng, lat] = pair;
    return { name: selectedDestination.name, lng, lat };
  }, [selectedDestination]);

  const contextualOriginMarker = useMemo(() => {
    if (!directionsMode || !routeStartCustom) return null;
    const pair = lngLatTuple(routeStartCustom.coordinates);
    if (!pair) return null;
    const [lng, lat] = pair;
    return { name: routeStartCustom.name, lng, lat };
  }, [directionsMode, routeStartCustom]);

  const hasContextualRoute =
    Array.isArray(safeRouteData) && safeRouteData.length >= 2;

  return (
    <main className="relative h-dvh w-screen">
      <RouteToast message={toastMessage} variant="error" onDismiss={dismissToast} />

      {/* Incoming SOS alert banner — Realtime INSERT on active_sos */}
      <IncomingSOSBanner
        sos={incomingSOS}
        onDismiss={() => setIncomingSOS(null)}
        onLocate={(coords) =>
          setFlyTarget({ latitude: coords[1], longitude: coords[0], zoom: 17 })
        }
      />

      {/* Safe Walk dead-man's-switch timer */}
      {showSafeWalk && (
        <SafeWalkTimer
          userCoords={userCoords}
          onEnd={() => setShowSafeWalk(false)}
        />
      )}

      {/* Hotspot nudge — shown when user enters a high-incident zone */}
      {showHotspotNudge && !showSafeWalk && (
        <HotspotNudge
          onStart={() => {
            setShowHotspotNudge(false);
            setShowSafeWalk(true);
          }}
          onDismiss={() => {
            setShowHotspotNudge(false);
            // Don't re-nudge for 10 minutes after dismissal
            nudgeDismissedUntil.current = Date.now() + 10 * 60 * 1000;
          }}
        />
      )}

      <div className="absolute inset-0 z-0 overflow-hidden">
        <RadiantMap
          onFlyTo={flyTarget}
          reports={reportsForRadiantMap}
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
          policeStations={VIC_POLICE_STATIONS}
          healthFacilities={VIC_HEALTH_FACILITIES}
          crimeIntensityFilter={crimeIntensityFilter}
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
          onGetSafeRoute={() => {
            void requestContextualSafeRoute();
          }}
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
          onGetSafeRoute={() => {
            void requestContextualSafeRoute();
          }}
          onCloseDestination={closeDestinationCard}
          onEndRoute={endContextualRoute}
        />
      )}

      <div className="pointer-events-none absolute inset-0 z-10">
        <Suspense fallback={null}>
          <WelcomeBanner authUser={authUser} />
        </Suspense>

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
              intensity: i.intensity,
            }))}
            onViewMap={(coords) => setFlyTarget(coords)}
          />
        ) : (
          <div id="user-reported-panel" className="pointer-events-auto">
            <IncidentFeed
              reports={displayedUserReports}
              onViewMap={handleViewMap}
              onOpenReporterProfile={(id, name) => setReporterProfile({ id, name })}
              currentUserId={authUser?.id ?? null}
              onDeleteReport={handleDeleteReport}
              onVoteReport={handleVoteReport}
              onlyMine={showOnlyMyUserReports}
              onOnlyMineChange={setShowOnlyMyUserReports}
              totalBeforeMineFilter={submittedUserReports.length}
              reserveTopPx={220}
              collapsedLabel={
                displayedUserReports.length > 0
                  ? `User reports (${displayedUserReports.length})`
                  : "User reports"
              }
              sheetTitle="User-reported incidents"
            />
          </div>
        )}

        {/* User Reported empty state — only when nothing submitted this session */}
        {activeIncidentTab === "user-reported" &&
          userReportsHydrated &&
          submittedUserReports.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-radiant-border bg-radiant-surface/90 px-6 py-5 text-center shadow-xl backdrop-blur-xl">
              <span className="text-2xl">📍</span>
              <p className="text-sm font-semibold text-gray-200">No user reports yet</p>
              <p className="text-xs text-gray-500">
                Sign up with an 18+ account, then use the quick-report button to add one.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Left panel — SOS. Outside the z-10 overlay so z-[120] applies at root stacking context,
          staying above the directions card (z-[60]) on mobile. */}
      <div className="pointer-events-auto fixed left-0 top-[calc(50%-50px)] z-[120]">
        <SOSController
          userCoords={userCoords}
          onFlyTo={setFlyTarget}
          onAlertsChange={setSosMapAlerts}
          sosMapAlerts={sosMapAlerts}
          onAlertResolved={(alertId) =>
            setSosMapAlerts((prev) => prev.filter((a) => a.id !== alertId))
          }
          open={showSOSSheet}
          onOpenChange={(v) => {
            setShowSOSSheet(v);
            if (v) setFindMyOpen(false);
          }}
          areaPanelOpen={sosAreaOpen}
          onAreaPanelOpenChange={(v) => {
            setSosAreaOpen(v);
            if (v) setFindMyOpen(false);
          }}
          canReceiveSOSPings={canReceiveSOSPings}
          authUser={authUser}
          onRequestRouteToSosLocation={requestRouteToSosLocation}
        />
      </div>

      {/* Right panel — area summary. Fixed + outside z-10 overlay for same reason as SOS above. */}
      {routingStatus === "off" && (
        <div className="pointer-events-auto fixed right-0 top-[calc(50%-36px)] z-[110] w-[200px]">
          <AreaIncidentSummary
            center={mapCenter ?? { latitude: -37.8136, longitude: 144.9631, zoom: 13 }}
            vicpolItems={vicpolItems}
            supabaseItems={supabaseItems}
            active={activeIncidentTab === "official"}
          />
        </div>
      )}

      {/* TopNav outside pointer-events-none overlay so account / “Verify as First Responder” stay clickable (Codespaces, embedded previews, stacked sheets). */}
      <TopNav
        reputation={authUser ? reputationForAuthUser(authUser) : currentUser}
        user={authUser}
        mapCenter={mapCenter}
        activeIncidentTab={activeIncidentTab}
        onIncidentTabChange={setActiveIncidentTab}
        onSearchSelectArea={handleSelectArea}
        onLogout={handleLogout}
        directionsMode={directionsMode}
        onDirectionsModeChange={(active) => {
          setDirectionsMode(active);
          if (!active) setRouteStartCustom(null);
          setRouteError(null);
          setRouteInfo(null);
        }}
        routingActive={routingStatus !== "off"}
        onAuthUserPatch={handleAuthUserPatch}
        crimeIntensityFilter={crimeIntensityFilter}
        onCrimeIntensityFilterChange={setCrimeIntensityFilter}
        dataSourceFilter={dataSourceFilter}
        onDataSourceFilterChange={setDataSourceFilter}
      />

      <QuickReportFAB
        onPinLocation={handlePinLocation}
        onDropPinMode={handleDropPinMode}
        droppedPin={droppedPin}
        onReportSubmitted={handleReportSubmitted}
        onSOSPress={() => setShowSOSSheet(true)}
        onSafeWalkPress={() => setShowSafeWalk(true)}
        reportingAllowed={canSubmitReports}
        onRequireReportingAuth={() => router.push("/signup")}
      />

      {/* Feature controllers — self-contained, each owns its own UI and data */}
      <div className="pointer-events-auto fixed left-0 top-[calc(50%+48px)] z-[120]">
        <FindMyController
          userCoords={userCoords}
          onFriendLocationsChange={setFriendLocations}
          authUser={authUser}
          open={findMyOpen}
          onOpenChange={(v) => {
            setFindMyOpen(v);
            if (v) setSosAreaOpen(false);
          }}
        />
      </div>
      <DirectionsController
        userCoords={userCoords}
        onRouteChange={setActiveRoute}
      />

      {/* Locate-me — above map overlays; Cursor/embedded previews often lack geolocation (see toast on click). */}
      <button
        onClick={handleLocateMe}
        title={
          geolocationApiMissing
            ? "GPS unavailable in this preview — open in Chrome or Edge"
            : locating
              ? "Requesting your location…"
              : userCoords
                ? "Centre map on your location"
                : locationPermission === "denied" || locationDenied
                  ? "Tap to retry — you may need to unblock location in your browser"
                  : "Enable current location"
        }
        className={cn(
          "pointer-events-auto fixed bottom-6 left-6 z-[130] flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition-all hover:scale-105 active:scale-95",
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
        <div className="pointer-events-auto fixed bottom-[72px] left-6 z-[130] w-72 rounded-2xl border border-amber-500/30 bg-radiant-surface/95 p-4 shadow-2xl backdrop-blur-xl">
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

      <ReporterProfileModal
        open={reporterProfile != null}
        onClose={() => setReporterProfile(null)}
        reporterId={reporterProfile?.id ?? ""}
        reporterDisplayName={reporterProfile?.name ?? ""}
        reports={submittedUserReports.filter(
          (r) =>
            `${r.reporterId ?? r.userId ?? ""}`.trim().toLowerCase() ===
            (reporterProfile?.id ?? "").trim().toLowerCase()
        )}
        onViewMap={handleViewMap}
        currentUserId={authUser?.id ?? null}
        onDeleteReport={handleDeleteReport}
      />
    </main>
  );
}
