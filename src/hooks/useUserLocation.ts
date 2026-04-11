"use client";

import { useState, useEffect } from "react";

export type LocationPermission = "pending" | "granted" | "denied";

export interface UserCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface UserLocationState {
  coords: UserCoords | null;
  error: string | null;
  permission: LocationPermission;
}

/**
 * Continuously watches the device's GPS position via watchPosition.
 * Updates in real-time as the user moves.
 * Permission state is surfaced so the UI can react (e.g. prompt user).
 */
export function useUserLocation(): UserLocationState {
  const [state, setState] = useState<UserLocationState>({
    coords: null,
    error: null,
    permission: "pending",
  });

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ coords: null, error: "Geolocation not supported", permission: "denied" });
      return;
    }

    // Prime coords quickly: watchPosition can delay the first fix; getCurrentPosition
    // usually returns sooner after the user allows location.
    // Use a 5-minute cache so returning visitors get their position instantly.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
          error: null,
          permission: "granted",
        });
      },
      () => {
        /* watch below will still try; avoid flipping to denied on first-shot timeout */
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
          error: null,
          permission: "granted",
        });
      },
      (err) => {
        setState((prev) => ({
          coords: prev.coords,
          error: err.message,
          permission: err.code === GeolocationPositionError.PERMISSION_DENIED ? "denied" : prev.permission,
        }));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return state;
}
