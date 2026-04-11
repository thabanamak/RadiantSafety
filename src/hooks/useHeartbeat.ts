"use client";

import { useEffect, useRef } from "react";
import { getDeviceId } from "@/lib/identity";

export type HeartbeatMode = "passive" | "active_guardian";

const INTERVALS: Record<HeartbeatMode, number> = {
  passive: 60_000,       // 60 seconds
  active_guardian: 15_000, // 15 seconds
};

interface HeartbeatOptions {
  coords: { latitude: number; longitude: number } | null;
  mode: HeartbeatMode;
}

/**
 * Pings /api/pulse on a regular interval so the user_pulse table stays fresh.
 * Interval switches automatically when mode changes (passive 60s ↔ active_guardian 15s).
 * Coords are read via a ref so the interval never needs to restart on position updates.
 */
export function useHeartbeat({ coords, mode }: HeartbeatOptions): void {
  const coordsRef = useRef(coords);

  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  useEffect(() => {
    const ping = async () => {
      const current = coordsRef.current;
      if (!current) return;

      const userId = getDeviceId();
      if (!userId) return;

      try {
        await fetch("/api/pulse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            lat: current.latitude,
            lng: current.longitude,
            mode,
          }),
        });
      } catch {
        // Heartbeat is best-effort — silently skip on network failure
      }
    };

    ping(); // Immediate ping on mount / mode change
    const id = setInterval(ping, INTERVALS[mode]);
    return () => clearInterval(id);
  }, [mode]); // Restarts with new interval when mode changes
}
