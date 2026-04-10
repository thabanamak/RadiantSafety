"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Map, { Layer, Marker, Source, type MapRef } from "react-map-gl/mapbox";
import type { LayerProps, MapMouseEvent } from "react-map-gl/mapbox";
import { toGeoJSON, userReports, MELBOURNE_CENTER } from "@/lib/mock-data";
import type { MapIncidentPoint } from "@/lib/types";
import { MapPin } from "lucide-react";

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
}

export default function RadiantMap({
  onFlyTo,
  reports,
  onCenterChange,
  dropPinMode,
  onPinDropped,
  gpsPin,
  droppedPin,
}: RadiantMapProps) {
  const mapRef = useRef<MapRef>(null);
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

  const geojson = toGeoJSON(reports ?? userReports);

  useEffect(() => {
    if (!onFlyTo || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [onFlyTo.longitude, onFlyTo.latitude],
      zoom: onFlyTo.zoom ?? 16,
      pitch: 45,
      duration: 1500,
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
    });
  }, [gpsPin]);

  // Intentionally DO NOT fly-to on droppedPin.
  // The UX should feel like the pin melts into the map rather than the camera snapping/zooming.

  const onMove = useCallback(
    (evt: { viewState: typeof viewState }) => {
      setViewState(evt.viewState);
      onCenterChange?.({
        latitude: evt.viewState.latitude,
        longitude: evt.viewState.longitude,
        zoom: evt.viewState.zoom,
      });
    },
    [onCenterChange]
  );

  const handleMapClick = useCallback(
    (evt: MapMouseEvent) => {
      if (!dropPinMode) return;
      onPinDropped?.({
        latitude: evt.lngLat.lat,
        longitude: evt.lngLat.lng,
      });
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
    </Map>
  );
}
