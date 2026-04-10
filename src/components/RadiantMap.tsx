"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Map, { Layer, Source, type MapRef } from "react-map-gl/mapbox";
import type { LayerProps } from "react-map-gl/mapbox";
import { toGeoJSON, userReports, MELBOURNE_CENTER } from "@/lib/mock-data";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

const heatmapLayer: LayerProps = {
  id: "reports-heat",
  type: "heatmap",
  source: "reports",
  maxzoom: 18,
  paint: {
    "heatmap-weight": ["interpolate", ["linear"], ["get", "trustScore"], 0, 0, 1, 1],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1, 18, 3],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,    "rgba(0,0,0,0)",
      0.15, "rgba(255,0,0,0.08)",
      0.3,  "rgba(255,0,0,0.2)",
      0.5,  "rgba(255,0,0,0.4)",
      0.7,  "rgba(255,20,20,0.6)",
      0.9,  "rgba(255,40,40,0.8)",
      1,    "rgba(255,60,60,1)",
    ],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 20, 15, 40, 18, 60],
    "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.9, 18, 0.6],
  },
};

interface RadiantMapProps {
  onFlyTo?: { latitude: number; longitude: number; zoom?: number } | null;
}

export default function RadiantMap({ onFlyTo }: RadiantMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState({
    latitude: MELBOURNE_CENTER.latitude as number,
    longitude: MELBOURNE_CENTER.longitude as number,
    zoom: MELBOURNE_CENTER.zoom as number,
    bearing: 0,
    pitch: 30,
  });

  const geojson = toGeoJSON(userReports);

  useEffect(() => {
    if (!onFlyTo || !mapRef.current) return;

    mapRef.current.flyTo({
      center: [onFlyTo.longitude, onFlyTo.latitude],
      zoom: onFlyTo.zoom ?? 16,
      pitch: 45,
      duration: 1500,
    });
  }, [onFlyTo]);

  const onMove = useCallback(
    (evt: { viewState: typeof viewState }) => setViewState(evt.viewState),
    []
  );

  return (
    <Map
      ref={mapRef}
      {...viewState}
      onMove={onMove}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      style={{ width: "100%", height: "100%" }}
      attributionControl={false}
      reuseMaps
    >
      <Source id="reports" type="geojson" data={geojson}>
        <Layer {...heatmapLayer} />
      </Source>
    </Map>
  );
}
