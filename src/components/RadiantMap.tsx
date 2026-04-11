"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Map, { Layer, Marker, Popup, Source, type MapRef } from "react-map-gl/mapbox";
import type { LayerProps, MapMouseEvent } from "react-map-gl/mapbox";
import {
  toGeoJSON,
  userReports,
  userReportToMapPoint,
  MELBOURNE_CENTER,
} from "@/lib/mock-data";
import type { MapIncidentPoint } from "@/lib/types";
import { MapPin } from "lucide-react";
import type { SOSAlert } from "@/components/SOSAreaPanel";

export interface FriendLocation {
  id: string;
  lat: number;
  lng: number;
  name: string;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

const heatmapLayer: LayerProps = {
  id: "incidents-heat",
  type: "heatmap",
  source: "reports",
  maxzoom: 22,
  paint: {
    "heatmap-weight": [
      "interpolate", ["linear"], ["get", "intensity"],
      1, 0.088,
      10, 0.97,
    ],
    // Intensity keeps climbing as you zoom in so the flow stays rich
    "heatmap-intensity": [
      "interpolate", ["linear"], ["zoom"],
      10, 0.53,
      15, 1.5,
      18, 2.23,
    ],
    // Radius grows continuously — never shrinks back to dots
    "heatmap-radius": [
      "interpolate", ["linear"], ["zoom"],
      10, 20,
      13, 45,
      15, 78,
      18, 153,
    ],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,    "rgba(0,0,0,0)",
      0.05, "rgba(255,255,180,0)",
      0.15, "rgba(255,255,120,0.32)",
      0.3,  "rgba(255,220,60,0.53)",
      0.45, "rgba(255,170,20,0.67)",
      0.6,  "rgba(240,100,10,0.85)",
      0.75, "rgba(210,40,0,0.96)",
      0.9,  "rgba(160,10,0,0.98)",
      1.0,  "rgba(100,0,0,0.98)",
    ],
    // ~15–20% stronger than previous midpoint
    "heatmap-opacity": [
      "interpolate", ["linear"], ["zoom"],
      10, 0.82,
      18, 0.76,
    ],
  },
};

/** Avoid controlled-map feedback loops: Mapbox can re-emit move with tiny float drift. */
function viewStateMeaningfullyChanged(
  a: { latitude: number; longitude: number; zoom: number; bearing: number; pitch: number },
  b: typeof a
): boolean {
  const eps = 1e-7;
  return (
    Math.abs(a.latitude - b.latitude) > eps ||
    Math.abs(a.longitude - b.longitude) > eps ||
    Math.abs(a.zoom - b.zoom) > 1e-5 ||
    Math.abs(a.bearing - b.bearing) > 1e-4 ||
    Math.abs(a.pitch - b.pitch) > 1e-4
  );
}

function mapCenterMeaningfullyChanged(
  a: { latitude: number; longitude: number; zoom: number },
  b: { latitude: number; longitude: number; zoom: number }
): boolean {
  const eps = 1e-7;
  return (
    Math.abs(a.latitude - b.latitude) > eps ||
    Math.abs(a.longitude - b.longitude) > eps ||
    Math.abs(a.zoom - b.zoom) > 1e-5
  );
}

const pointsLayer: LayerProps = {
  id: "incidents-points",
  type: "circle",
  source: "reports",
  minzoom: 14,
  paint: {
    // Fades in gently as a subtle location marker on top of the heatmap
    "circle-opacity": [
      "interpolate", ["linear"], ["zoom"],
      14, 0,
      16, 0.45,
    ],
    "circle-color": "rgba(255,255,255,0.9)",
    "circle-radius": 4,
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "rgba(255,69,0,0.8)",
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
}: RadiantMapProps) {
  const mapRef = useRef<MapRef>(null);
  const lastReportedCenterRef = useRef<{
    latitude: number;
    longitude: number;
    zoom: number;
  } | null>(null);
  const [viewState, setViewState] = useState({
    latitude: MELBOURNE_CENTER.latitude as number,
    longitude: MELBOURNE_CENTER.longitude as number,
    zoom: MELBOURNE_CENTER.zoom as number,
    bearing: 0,
    pitch: 30,
  });

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

  const mapPoints =
    reports ?? userReports.map(userReportToMapPoint);
  const geojson = toGeoJSON(mapPoints);

  const [reportPopup, setReportPopup] = useState<{
    longitude: number;
    latitude: number;
    category: string;
    trustLabel: string | null;
    trustPoints: number | null;
  } | null>(null);

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

  const onMove = useCallback(
    (evt: { viewState: typeof viewState }) => {
      const vs = evt.viewState;
      const next = {
        latitude: vs.latitude,
        longitude: vs.longitude,
        zoom: vs.zoom,
        bearing: vs.bearing,
        pitch: vs.pitch,
      };
      setViewState((prev) =>
        viewStateMeaningfullyChanged(prev, next) ? next : prev
      );

      if (!onCenterChange) return;
      const center = {
        latitude: next.latitude,
        longitude: next.longitude,
        zoom: next.zoom,
      };
      const last = lastReportedCenterRef.current;
      if (last && !mapCenterMeaningfullyChanged(last, center)) return;
      lastReportedCenterRef.current = center;
      onCenterChange(center);
    },
    [onCenterChange]
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
      const feats = evt.features;
      const f = feats?.[0];
      if (f?.properties) {
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
        setReportPopup({
          longitude: evt.lngLat.lng,
          latitude: evt.lngLat.lat,
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

  return (
    <Map
      ref={mapRef}
      {...viewState}
      onMove={onMove}
      onClick={handleMapClick}
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
    </Map>
  );
}
