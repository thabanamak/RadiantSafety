"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, Popup, Source, type MapRef } from "react-map-gl/mapbox";
import type { LayerProps, MapMouseEvent } from "react-map-gl/mapbox";
import { cn } from "@/lib/cn";
import {
  toGeoJSON,
  userReports,
  userReportToMapPoint,
  MELBOURNE_CENTER,
} from "@/lib/mock-data";
import type { SafeRouteLineFeature } from "@/lib/safe-route";
import type { MapIncidentPoint } from "@/lib/types";
import { MapPin } from "lucide-react";
import type { SOSAlert } from "@/components/SOSAreaPanel";
import { MedicalCrossIcon } from "@/components/icons/MedicalCrossIcon";
import { VicPoliceMapIcon } from "@/components/icons/VicPoliceMapIcon";
import { zoomScaledMarkerDiameterPx } from "@/lib/map-marker-zoom";
import type { PoliceStation } from "@/lib/vic-police-stations";
import type { HealthFacility } from "@/lib/vic-health-facilities";
import {
  CRIME_HEATMAP_LAYER_ID,
  CRIME_POINTS_LAYER_ID,
  intensityFilterExpression,
  type IntensityFilter,
} from "@/lib/map-crime-intensity-filter";

/** Text-only label above police / health markers on hover. */
function MapFacilityHoverLabel({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 max-w-[min(260px,calc(100vw-40px))] -translate-x-1/2 rounded-lg border border-white/12 bg-neutral-950/95 px-3 py-2 text-center opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100"
      role="tooltip"
    >
      <p className="break-words text-[13px] font-semibold leading-snug tracking-tight text-white">{title}</p>
      {subtitle ? (
        <p className="mt-0.5 break-words text-[11px] leading-snug text-neutral-400">{subtitle}</p>
      ) : null}
    </div>
  );
}

export interface FriendLocation {
  id: string;
  lat: number;
  lng: number;
  name: string;
}

export type { IntensityFilter } from "@/lib/map-crime-intensity-filter";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

/**
 * Radiating yellow → amber → red; tuned ~30% stronger than the prior gentle pass
 * (weight, zoom-intensity, radius, colour alphas, layer opacity — caps where needed).
 */
const heatmapLayer: LayerProps = {
  id: "incidents-heat",
  type: "heatmap",
  source: "reports",
  maxzoom: 22,
  paint: {
    "heatmap-weight": [
      "interpolate", ["linear"], ["get", "intensity"],
      1, 0.072,
      10, 1,
    ],
    "heatmap-intensity": [
      "interpolate", ["linear"], ["zoom"],
      9, 0.29,
      10, 0.36,
      12, 0.55,
      15, 1.33,
      18, 1.98,
    ],
    "heatmap-radius": [
      "interpolate", ["linear"], ["zoom"],
      9, 16,
      10, 18,
      11, 23,
      12, 31,
      13, 52,
      15, 107,
      18, 202,
    ],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,    "rgba(0,0,0,0)",
      0.05, "rgba(255,255,200,0)",
      0.15, "rgba(255,252,150,0.29)",
      0.3,  "rgba(255,225,80,0.49)",
      0.45, "rgba(255,185,45,0.65)",
      0.6,  "rgba(248,120,35,0.75)",
      0.75, "rgba(220,55,18,0.86)",
      0.9,  "rgba(175,22,8,0.94)",
      1.0,  "rgba(115,8,4,0.99)",
    ],
    "heatmap-opacity": [
      "interpolate", ["linear"], ["zoom"],
      9, 0.68,
      10, 0.72,
      12, 0.73,
      15, 0.7,
      18, 0.65,
    ],
  },
};

function mapCenterMeaningfullyChanged(
  a: { latitude: number; longitude: number; zoom: number },
  b: { latitude: number; longitude: number; zoom: number }
): boolean {
  /** ~1.1 m — avoids spamming parent on sub-pixel map jitter (was 1e-7). */
  const epsLatLng = 1e-5;
  return (
    Math.abs(a.latitude - b.latitude) > epsLatLng ||
    Math.abs(a.longitude - b.longitude) > epsLatLng ||
    Math.abs(a.zoom - b.zoom) > 1e-4
  );
}

const pointsLayer: LayerProps = {
  id: "incidents-points",
  type: "circle",
  source: "reports",
  // Zoomed out: heatmap only (no big white discs). Circles fade in from ~z13 for taps + detail.
  minzoom: 12.5,
  paint: {
    "circle-opacity": [
      "interpolate", ["linear"], ["zoom"],
      12.5, 0,
      13, 0.22,
      14, 0.34,
      16, 0.48,
    ],
    "circle-color": "rgba(255,255,255,0.9)",
    "circle-radius": [
      "interpolate", ["linear"], ["zoom"],
      13, 4,
      14, 5,
      16, 6,
      18, 7,
    ],
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "rgba(255,69,0,0.8)",
  },
};

const safeRouteLayer: LayerProps = {
  id: "safe-route-line",
  type: "line",
  source: "safe-route",
  layout: {
    "line-join": "round",
    "line-cap": "round",
  },
  paint: {
    "line-color": "#22d3ee",
    "line-width": 5,
    "line-opacity": 0.92,
  },
};

const contextualSafeRouteLayer: LayerProps = {
  id: "contextual-safe-route-line",
  type: "line",
  source: "contextual-safe-route",
  layout: {
    "line-join": "round",
    "line-cap": "round",
  },
  paint: {
    "line-color": "#00BFFF",
    "line-width": 5,
    "line-opacity": 0.95,
  },
};

export type DroppedPin = {
  latitude: number;
  longitude: number;
};

interface RadiantMapProps {
  onFlyTo?: { latitude: number; longitude: number; zoom?: number } | null;
  reports?: MapIncidentPoint[];
  /** Called on pan/zoom with latest center */
  onCenterChange?: (center: { latitude: number; longitude: number; zoom: number }) => void;
  /** When true, next map click drops a pin */
  dropPinMode?: boolean;
  /** Called when user clicks to drop a pin */
  onPinDropped?: (pin: DroppedPin) => void;
  /** GPS pin from "ping me" — shown as a pulsing blue dot */
  gpsPin?: DroppedPin | null;
  /** Manually dropped pin — shown as animated red marker */
  droppedPin?: DroppedPin | null;
  /** Live device location from useUserLocation — persistent blue "you are here" dot */
  userLocation?: { latitude: number; longitude: number } | null;
  /** Active SOS alerts — rendered as radiating pulse markers */
  sosAlerts?: SOSAlert[];
  /** Friend locations from "Find My" feature — rendered as teal name-badge markers */
  friendLocations?: FriendLocation[];
  /** Active route geometry from Directions feature — rendered as a blue polyline */
  activeRoute?: { geometry: GeoJSON.LineString } | null;
  /** Heat-aware backend route (cyan line) — legacy panel flow */
  safeRouteLine?: SafeRouteLineFeature | null;
  /** Search-driven destination marker (Mapbox Marker) */
  contextualDestination?: { name: string; lng: number; lat: number } | null;
  /** Directions planner — custom start (when not using current location) */
  contextualOrigin?: { name: string; lng: number; lat: number } | null;
  /** GeoJSON LineString coordinates [lng, lat][] — contextual safe route, drawn above heatmap */
  contextualRouteCoordinates?: [number, number][] | null;
  /** Victoria Police stations — blue circular markers */
  policeStations?: PoliceStation[];
  /** Hospitals & medical centres — white circle + red cross; size follows zoom */
  healthFacilities?: HealthFacility[];
  /** Heatmap / point layer severity filter (controlled from TopNav). */
  crimeIntensityFilter: IntensityFilter;
}

export default function RadiantMap({
  onFlyTo,
  reports,
  onCenterChange,
  dropPinMode,
  onPinDropped,
  gpsPin,
  droppedPin,
  userLocation,
  sosAlerts = [],
  friendLocations = [],
  activeRoute,
  safeRouteLine,
  contextualDestination,
  contextualOrigin,
  contextualRouteCoordinates,
  policeStations = [],
  healthFacilities = [],
  crimeIntensityFilter,
}: RadiantMapProps) {
  const mapRef = useRef<MapRef>(null);

  // Memoize the contextual route GeoJSON so react-map-gl only calls
  // source.setData() when the coordinates array reference actually changes,
  // not on every map-move / zoom render.
  const contextualRouteGeoJSON = useMemo((): GeoJSON.Feature<GeoJSON.LineString> | null => {
    if (!contextualRouteCoordinates || contextualRouteCoordinates.length < 2) return null;
    // Deduplicate consecutive identical points to prevent micro-loops.
    const deduped: [number, number][] = [contextualRouteCoordinates[0]];
    for (let i = 1; i < contextualRouteCoordinates.length; i++) {
      const prev = deduped[deduped.length - 1];
      const cur = contextualRouteCoordinates[i];
      if (cur[0] !== prev[0] || cur[1] !== prev[1]) deduped.push(cur);
    }
    if (deduped.length < 2) return null;
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: deduped },
    };
  }, [contextualRouteCoordinates]);
  const mapShellRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lastReportedCenterRef = useRef<{
    latitude: number;
    longitude: number;
    zoom: number;
  } | null>(null);
  /** Only `setMapZoom` when zoom moves enough — Mapbox emits tiny float drift each frame and causes update-depth loops. */
  const lastReportedMapZoomRef = useRef<number>(MELBOURNE_CENTER.zoom as number);
  /** Uncontrolled viewport — do not mirror Mapbox viewState in React (avoids move/setState feedback loops). */
  const initialViewState = useRef({
    latitude: MELBOURNE_CENTER.latitude as number,
    longitude: MELBOURNE_CENTER.longitude as number,
    zoom: MELBOURNE_CENTER.zoom as number,
    bearing: 0,
    pitch: 30,
  }).current;

  // Animate the dropped pin — cycle through colours as it "melts" in
  const [pinPhase, setPinPhase] = useState<0 | 1 | 2 | 3>(0);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!droppedPin) {
      setPinPhase(0);
      return;
    }
    // Phase 0 → amber → red → deep red → dissolved
    setPinPhase(0);
    phaseTimerRef.current = setTimeout(() => setPinPhase(1), 400);
    const t2 = setTimeout(() => setPinPhase(2), 900);
    const t3 = setTimeout(() => setPinPhase(3), 1700);
    return () => {
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [droppedPin]);

  const mapPoints = useMemo(
    () => reports ?? userReports.map(userReportToMapPoint),
    [reports]
  );
  const geojson = useMemo(() => toGeoJSON(mapPoints), [mapPoints]);

  const [reportPopup, setReportPopup] = useState<{
    longitude: number;
    latitude: number;
    category: string;
    trustLabel: string | null;
    trustPoints: number | null;
  } | null>(null);

  /** Current zoom for police / medical marker sizing (updated on map move). */
  const [mapZoom, setMapZoom] = useState<number>(initialViewState.zoom);

  /** Crime heatmap + circle layer: filter GeoJSON features by `intensity` (Mapbox `setFilter`). */
  const syncCrimeLayerFilters = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map?.isStyleLoaded()) return;
    const expr = intensityFilterExpression(crimeIntensityFilter);
    for (const layerId of [CRIME_HEATMAP_LAYER_ID, CRIME_POINTS_LAYER_ID]) {
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, expr);
      }
    }
  }, [crimeIntensityFilter]);

  useEffect(() => {
    syncCrimeLayerFilters();
  }, [syncCrimeLayerFilters, geojson]);

  useEffect(
    () => () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    },
    []
  );

  /** Parent callback identity can churn; read latest without re-subscribing Map `onMove`. */
  const onCenterChangeRef = useRef(onCenterChange);
  onCenterChangeRef.current = onCenterChange;

  /**
   * Cursor’s embedded browser (and some Mapbox timing paths) can call `onMove` while React is still
   * processing updates from the previous move. Deferring `setState` to the next animation frame
   * exits Mapbox’s synchronous stack before updating React — avoids “Maximum update depth exceeded”.
   */
  const moveFlushRafRef = useRef<number | null>(null);
  const pendingZoomForMoveFlushRef = useRef<number | null>(null);
  const pendingCenterForMoveFlushRef = useRef<{
    latitude: number;
    longitude: number;
    zoom: number;
  } | null>(null);

  const scheduleMoveStateFlush = useCallback(() => {
    if (moveFlushRafRef.current != null) return;
    moveFlushRafRef.current = requestAnimationFrame(() => {
      moveFlushRafRef.current = null;
      const pz = pendingZoomForMoveFlushRef.current;
      pendingZoomForMoveFlushRef.current = null;
      if (pz != null) {
        lastReportedMapZoomRef.current = pz;
        setMapZoom(pz);
      }
      const pc = pendingCenterForMoveFlushRef.current;
      pendingCenterForMoveFlushRef.current = null;
      const cb = onCenterChangeRef.current;
      if (pc && cb) {
        const last = lastReportedCenterRef.current;
        if (!last || mapCenterMeaningfullyChanged(last, pc)) {
          lastReportedCenterRef.current = pc;
          cb(pc);
        }
      }
    });
  }, []);

  useEffect(
    () => () => {
      if (moveFlushRafRef.current != null) {
        cancelAnimationFrame(moveFlushRafRef.current);
        moveFlushRafRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (!onFlyTo || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [onFlyTo.longitude, onFlyTo.latitude],
      zoom: onFlyTo.zoom ?? 15,
      pitch: 45,
      duration: 1500,
      essential: true,
    });
  }, [onFlyTo]);

  // Fly to GPS pin when it appears
  useEffect(() => {
    if (!gpsPin || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [gpsPin.longitude, gpsPin.latitude],
      zoom: 16,
      pitch: 45,
      duration: 1200,
      essential: true,
    });
  }, [gpsPin]);

  // Intentionally DO NOT fly-to on droppedPin.
  // The UX should feel like the pin melts into the map rather than the camera snapping/zooming.

  useEffect(() => {
    if (!safeRouteLine || !mapRef.current) return;
    const coords = safeRouteLine.geometry.coordinates;
    if (coords.length < 2) return;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    mapRef.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: { top: 100, bottom: 160, left: 60, right: 60 }, duration: 1400, pitch: 40 }
    );
  }, [safeRouteLine]);

  useEffect(() => {
    if (!contextualRouteGeoJSON || !mapRef.current) return;
    const coords = contextualRouteGeoJSON.geometry.coordinates as [number, number][];
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    mapRef.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: { top: 100, bottom: 200, left: 48, right: 48 }, duration: 1400, pitch: 40 }
    );
  }, [contextualRouteGeoJSON]);

  const onMove = useCallback(
    (evt: { viewState: { latitude: number; longitude: number; zoom: number } }) => {
      const z = evt.viewState.zoom;
      let shouldFlush = false;
      const zDiff = Math.abs(z - lastReportedMapZoomRef.current);
      if (zDiff > 0.007) {
        pendingZoomForMoveFlushRef.current = z;
        shouldFlush = true;
      }
      if (onCenterChangeRef.current) {
        const vs = evt.viewState;
        const center = {
          latitude: vs.latitude,
          longitude: vs.longitude,
          zoom: vs.zoom,
        };
        const last = lastReportedCenterRef.current;
        if (!last || mapCenterMeaningfullyChanged(last, center)) {
          pendingCenterForMoveFlushRef.current = center;
          shouldFlush = true;
        }
      }
      if (shouldFlush) scheduleMoveStateFlush();
    },
    [scheduleMoveStateFlush]
  );

  const handleMapClick = useCallback(
    (evt: MapMouseEvent) => {
      if (dropPinMode) {
        onPinDropped?.({
          latitude: evt.lngLat.lat,
          longitude: evt.lngLat.lng,
        });
        return;
      }

      let f = evt.features?.[0] ?? null;
      if (!f?.properties) {
        const mapbox = mapRef.current?.getMap?.();
        if (mapbox) {
          const { x, y } = evt.point;
          const pad = 20;
          const hits = mapbox.queryRenderedFeatures(
            [
              [x - pad, y - pad],
              [x + pad, y + pad],
            ],
            { layers: ["incidents-points"] }
          );
          f = hits[0] ?? null;
        }
      }

      if (f?.properties && f.geometry && f.geometry.type === "Point") {
        const [lng, lat] = f.geometry.coordinates as [number, number];
        const p = f.properties as Record<string, unknown>;
        const cat = String(p.category ?? "Report");
        const tp = p.trustPoints;
        const trustPoints =
          typeof tp === "number"
            ? tp
            : tp != null
              ? Number(tp)
              : null;
        const tl = p.trustLabel;
        const trustLabel =
          typeof tl === "string" ? tl : tl != null ? String(tl) : null;

        const map = mapRef.current;
        const currentZoom = map?.getZoom?.() ?? 13;
        map?.flyTo({
          center: [lng, lat],
          zoom: Math.max(currentZoom, 16),
          pitch: 45,
          duration: 1100,
          essential: true,
        });

        setReportPopup({
          longitude: lng,
          latitude: lat,
          category: cat,
          trustLabel,
          trustPoints: Number.isFinite(trustPoints as number)
            ? (trustPoints as number)
            : null,
        });
        return;
      }
      setReportPopup(null);
    },
    [dropPinMode, onPinDropped]
  );

  const pinColors: Record<0 | 1 | 2 | 3, string> = {
    0: "#f59e0b", // amber — just landed
    1: "#ef4444", // red — melting
    2: "#b91c1c", // deep red — set
    3: "#b91c1c", // dissolved
  };

  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    const shell = mapShellRef.current;
    // Overlay / nav layout changes (e.g. TopNav moved) often resize the shell without a window
    // `resize` event — Mapbox then draws a wrong-sized framebuffer and custom layers can vanish.
    requestAnimationFrame(() => {
      map?.resize();
      syncCrimeLayerFilters();
    });
    if (!map || !shell || typeof ResizeObserver === "undefined") return;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = new ResizeObserver(() => {
      map.resize();
      requestAnimationFrame(() => syncCrimeLayerFilters());
    });
    resizeObserverRef.current.observe(shell);
  }, [syncCrimeLayerFilters]);

  return (
    <div ref={mapShellRef} className="relative h-full min-h-0 w-full">
    <Map
      ref={mapRef}
      initialViewState={initialViewState}
      onMove={onMove}
      onClick={handleMapClick}
      onLoad={onMapLoad}
      interactiveLayerIds={["incidents-points"]}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      style={{ width: "100%", height: "100%" }}
      attributionControl={false}
      cursor={dropPinMode ? "crosshair" : "grab"}
      reuseMaps
    >
      <Source id="reports" type="geojson" data={geojson}>
        <Layer {...heatmapLayer} />
        <Layer {...pointsLayer} />
      </Source>

      {safeRouteLine && (
        <Source id="safe-route" type="geojson" data={safeRouteLine}>
          <Layer {...safeRouteLayer} />
        </Source>
      )}

      {contextualRouteGeoJSON && (
        <Source
          key={`contextual-route-${contextualRouteGeoJSON.geometry.coordinates.length}`}
          id="contextual-safe-route"
          type="geojson"
          data={contextualRouteGeoJSON}
        >
          <Layer {...contextualSafeRouteLayer} />
        </Source>
      )}

      {reportPopup && (
        <Popup
          longitude={reportPopup.longitude}
          latitude={reportPopup.latitude}
          anchor="bottom"
          onClose={() => setReportPopup(null)}
          closeButton
          closeOnClick={false}
        >
          <div className="max-w-[220px] text-xs text-gray-900">
            <p className="font-semibold">{reportPopup.category}</p>
            {reportPopup.trustLabel != null && (
              <p className="mt-1 text-gray-700">
                {reportPopup.trustLabel}
                {reportPopup.trustPoints != null && (
                  <span className="text-gray-500">
                    {" "}
                    · trust {reportPopup.trustPoints}
                  </span>
                )}
              </p>
            )}
            {reportPopup.trustLabel == null && (
              <p className="mt-1 text-gray-600">Official / historical incident</p>
            )}
          </div>
        </Popup>
      )}

      {/* GPS "ping me" marker — pulsing blue dot */}
      {gpsPin && (
        <Marker latitude={gpsPin.latitude} longitude={gpsPin.longitude} anchor="center">
          <div className="relative flex items-center justify-center">
            {/* Outer pulse ring */}
            <span className="absolute inline-flex h-8 w-8 animate-ping rounded-full bg-blue-400 opacity-40" />
            {/* Inner dot */}
            <span className="relative inline-flex h-4 w-4 rounded-full bg-blue-500 ring-2 ring-white/60 shadow-lg shadow-blue-500/50" />
          </div>
        </Marker>
      )}

      {/* Live device location — persistent blue "you are here" dot */}
      {userLocation && (
        <Marker latitude={userLocation.latitude} longitude={userLocation.longitude} anchor="center">
          <div className="relative flex items-center justify-center">
            <span className="absolute inline-flex h-10 w-10 animate-ping rounded-full bg-blue-500 opacity-25" />
            <span className="absolute inline-flex h-6 w-6 rounded-full bg-blue-500 opacity-15" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-blue-400 ring-2 ring-white shadow-lg shadow-blue-500/70" />
          </div>
        </Marker>
      )}

      {/* SOS alert pulse markers — radiating rings coloured by issue type */}
      {sosAlerts.map((alert) => {
        const colors: Record<string, string> = {
          allergy: "#f97316", // orange
          medical: "#22c55e", // green
          cpr:     "#ec4899", // pink
        };
        const color = colors[alert.issue] ?? colors.medical;
        return (
          <Marker key={alert.id} latitude={alert.location_lat} longitude={alert.location_lng} anchor="center">
            <div className="relative flex items-center justify-center">
              {/* Three staggered expanding rings */}
              <span className="absolute rounded-full"
                style={{ width: 72, height: 72, backgroundColor: color, opacity: 0.18,
                  animation: "ping 1.6s cubic-bezier(0,0,0.2,1) infinite", animationDelay: "0ms" }} />
              <span className="absolute rounded-full"
                style={{ width: 48, height: 48, backgroundColor: color, opacity: 0.25,
                  animation: "ping 1.6s cubic-bezier(0,0,0.2,1) infinite", animationDelay: "400ms" }} />
              <span className="absolute rounded-full"
                style={{ width: 28, height: 28, backgroundColor: color, opacity: 0.35,
                  animation: "ping 1.6s cubic-bezier(0,0,0.2,1) infinite", animationDelay: "800ms" }} />
              {/* Solid centre dot */}
              <span className="relative h-4 w-4 rounded-full ring-2 ring-white/70 shadow-lg"
                style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}99` }} />
            </div>
          </Marker>
        );
      })}

      {/* Directions planner — custom start */}
      {contextualOrigin && (
        <Marker latitude={contextualOrigin.lat} longitude={contextualOrigin.lng} anchor="bottom">
          <div className="flex flex-col items-center">
            <div className="rounded-md border border-black/20 bg-teal-950/95 px-1.5 py-0.5 text-[10px] font-medium text-teal-100 shadow-md max-w-[200px] truncate">
              {contextualOrigin.name}
            </div>
            <div className="h-0 w-0 border-x-[7px] border-x-transparent border-t-[9px] border-t-teal-900 drop-shadow-md" />
            <div className="-mt-px h-3 w-3 rounded-full border-2 border-white bg-teal-500 shadow-lg ring-1 ring-black/30" />
          </div>
        </Marker>
      )}

      {/* Search-selected destination — standard pin */}
      {contextualDestination && (
        <Marker latitude={contextualDestination.lat} longitude={contextualDestination.lng} anchor="bottom">
          <div className="flex flex-col items-center">
            <div className="rounded-md border border-black/20 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-900 shadow-md max-w-[200px] truncate">
              {contextualDestination.name}
            </div>
            <div className="h-0 w-0 border-x-[7px] border-x-transparent border-t-[9px] border-t-white drop-shadow-md" />
            <div className="-mt-px h-3 w-3 rounded-full border-2 border-white bg-rose-500 shadow-lg ring-1 ring-black/30" />
          </div>
        </Marker>
      )}

      {/* Manually dropped pin — animated colour-melt */}
      {droppedPin && (
        <Marker latitude={droppedPin.latitude} longitude={droppedPin.longitude} anchor="bottom">
          <div
            className="flex flex-col items-center transition-all duration-700"
            style={{
              filter: `drop-shadow(0 4px 10px ${pinColors[pinPhase]}66)`,
              transform:
                pinPhase === 3
                  ? "translateY(14px)"
                  : pinPhase === 2
                    ? "translateY(6px)"
                    : pinPhase === 1
                      ? "translateY(2px)"
                      : "translateY(0px)",
              opacity: pinPhase === 3 ? 0.0 : 1.0,
            }}
          >
            <MapPin
              className="h-9 w-9 transition-all duration-700"
              style={{
                color: pinColors[pinPhase],
                transform: pinPhase === 3 ? "scale(0.75)" : "scale(1)",
              }}
              strokeWidth={2}
            />
            {/* Melt pool under pin */}
            <span
              className="mt-[-4px] rounded-full transition-all duration-1000"
              style={{
                width: pinPhase === 3 ? "64px" : pinPhase === 2 ? "26px" : pinPhase === 1 ? "16px" : "8px",
                height: pinPhase === 3 ? "20px" : pinPhase === 2 ? "10px" : pinPhase === 1 ? "6px" : "3px",
                opacity: pinPhase === 3 ? 0.55 : 0.9,
                background: `radial-gradient(ellipse, ${pinColors[pinPhase]}88 0%, rgba(255,200,0,0.12) 35%, transparent 78%)`,
              }}
            />
          </div>
        </Marker>
      )}

      {/* Drop-pin mode overlay hint */}
      {dropPinMode && (
        <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center">
          <div className="rounded-full border border-amber-500/40 bg-black/70 px-4 py-2 text-xs font-medium text-amber-300 backdrop-blur-sm shadow-lg">
            Tap anywhere on the map to drop your pin
          </div>
        </div>
      )}

      {/* Active route polyline — owned by Directions feature */}
      {activeRoute && (
        <Source
          id="active-route"
          type="geojson"
          data={{ type: "Feature", properties: {}, geometry: activeRoute.geometry }}
        >
          <Layer
            id="active-route-line"
            type="line"
            paint={{
              "line-color": "#38bdf8",
              "line-width": 4,
              "line-opacity": 0.85,
            }}
            layout={{ "line-cap": "round", "line-join": "round" }}
          />
        </Source>
      )}

      {/* Friend location markers — owned by Find My feature */}
      {friendLocations.map((friend) => (
        <Marker key={friend.id} latitude={friend.lat} longitude={friend.lng} anchor="bottom">
          <div className="flex flex-col items-center gap-0.5">
            {/* Name badge */}
            <div className="rounded-full border border-teal-400/50 bg-teal-900/80 px-2 py-0.5 text-[10px] font-semibold text-teal-300 shadow backdrop-blur-sm whitespace-nowrap">
              {friend.name}
            </div>
            {/* Dot */}
            <div className="relative flex items-center justify-center">
              <span className="absolute inline-flex h-5 w-5 animate-ping rounded-full bg-teal-400 opacity-30" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-teal-400 ring-2 ring-white/60 shadow-lg shadow-teal-400/50" />
            </div>
          </div>
        </Marker>
      ))}

      {/* Police stations — dark blue discs, white badge; size tracks map zoom */}
      {policeStations.map((ps) => {
        const d = zoomScaledMarkerDiameterPx(mapZoom);
        const iconPx = Math.max(7, Math.round(d * 0.48));
        return (
          <Marker
            key={ps.id}
            latitude={ps.latitude}
            longitude={ps.longitude}
            anchor="center"
          >
            <div className="group relative z-30 inline-flex flex-col items-center">
              <MapFacilityHoverLabel title={ps.name} subtitle={ps.suburb} />
              <div
                className="flex shrink-0 cursor-default items-center justify-center rounded-full shadow-lg ring-2 ring-blue-950/70"
                style={{
                  width: d,
                  height: d,
                  backgroundColor: "#00264d",
                  boxShadow: "0 2px 10px rgba(0, 18, 51, 0.55)",
                }}
                role="img"
                aria-label={`Police station: ${ps.name}`}
              >
                <VicPoliceMapIcon sizePx={iconPx} />
              </div>
            </div>
          </Marker>
        );
      })}

      {/* Hospitals & medical centres — white disc + red cross; medical centres use a red ring */}
      {healthFacilities.map((hf) => {
        const d = zoomScaledMarkerDiameterPx(mapZoom);
        const iconPx = Math.max(7, Math.round(d * 0.5));
        const isHospital = hf.kind === "hospital";
        const kindLabel = isHospital ? "Hospital" : "Medical centre";
        return (
          <Marker
            key={hf.id}
            latitude={hf.latitude}
            longitude={hf.longitude}
            anchor="center"
          >
            <div className="group relative z-30 inline-flex flex-col items-center">
              <MapFacilityHoverLabel title={hf.name} subtitle={`${kindLabel} · ${hf.suburb}`} />
              <div
                className={cn(
                  "flex shrink-0 cursor-default items-center justify-center rounded-full shadow-md",
                  isHospital ? "ring-2 ring-slate-400/60" : "ring-2 ring-red-500/70"
                )}
                style={{
                  width: d,
                  height: d,
                  backgroundColor: "#ffffff",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                }}
                role="img"
                aria-label={`${kindLabel}: ${hf.name}`}
              >
                <MedicalCrossIcon sizePx={iconPx} />
              </div>
            </div>
          </Marker>
        );
      })}
    </Map>
    </div>
  );
}
