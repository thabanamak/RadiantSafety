"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ShieldCheck, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getDeviceId } from "@/lib/identity";
import type { RealtimeChannel } from "@supabase/supabase-js";

const DURATION_S = process.env.NODE_ENV === "development" ? 15 : 5 * 60;
const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const STATUS_HEARTBEAT_MS = 30_000;

const STORAGE_ROOM_KEY = "radiant_findmy_room";
const STORAGE_NAME_KEY = "radiant_findmy_name";

interface SafeWalkTimerProps {
  userCoords: { latitude: number; longitude: number } | null;
  onEnd: () => void;
}

export default function SafeWalkTimer({ userCoords, onEnd }: SafeWalkTimerProps) {
  const [remaining, setRemaining] = useState(DURATION_S);
  const [sosFired, setSosFired] = useState(false);
  const coordsRef = useRef(userCoords);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => { coordsRef.current = userCoords; }, [userCoords]);

  // Helper: send a safewalk_status broadcast on the room channel
  const broadcastStatus = useCallback((active: boolean) => {
    const roomCode = typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_ROOM_KEY)
      : null;
    if (!roomCode) return;
    const displayName = (typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_NAME_KEY)
      : null) ?? "";
    const sb = getSupabaseBrowser();
    if (!sb) return;

    // Reuse the persistent channel if already subscribed
    if (!channelRef.current) {
      channelRef.current = sb.channel(`findmy-room-${roomCode.toUpperCase()}`);
      channelRef.current.subscribe();
    }
    void channelRef.current.send({
      type: "broadcast",
      event: "safewalk_status",
      payload: {
        device_id: getDeviceId(),
        display_name: displayName || "A friend",
        active,
        updated_at: new Date().toISOString(),
      },
    });
  }, []);

  // Announce safe walk active on mount, clean up on unmount
  useEffect(() => {
    broadcastStatus(true);
    const heartbeat = setInterval(() => broadcastStatus(true), STATUS_HEARTBEAT_MS);
    return () => {
      clearInterval(heartbeat);
      broadcastStatus(false);
      if (channelRef.current) {
        const sb = getSupabaseBrowser();
        if (sb) void sb.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [broadcastStatus]);

  const fireSOS = useCallback(async () => {
    const coords = coordsRef.current;
    setSosFired(true);

    // 1. Notify friends in the room via Realtime broadcast
    const roomCode = typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_ROOM_KEY)
      : null;
    const displayName = typeof window !== "undefined"
      ? (localStorage.getItem(STORAGE_NAME_KEY) ?? "")
      : "";

    if (roomCode) {
      try {
        const sb = getSupabaseBrowser();
        if (sb) {
          // Reuse persistent channel
          if (!channelRef.current) {
            channelRef.current = sb.channel(`findmy-room-${roomCode.toUpperCase()}`);
            channelRef.current.subscribe();
          }
          await new Promise<void>((resolve) => {
            void channelRef.current!.send({
              type: "broadcast",
              event: "safewalk_expired",
              payload: {
                device_id: getDeviceId(),
                display_name: displayName || "A friend",
                room_code: roomCode.toUpperCase(),
                fired_at: new Date().toISOString(),
              },
            });
            setTimeout(resolve, 300);
          });
        }
      } catch {
        // best-effort
      }
    }

    // 2. Also insert into active_sos for verified responders (existing behaviour)
    if (coords) {
      const { latitude, longitude } = coords;
      try {
        const sb = getSupabaseBrowser();
        if (sb) {
          await sb.from("active_sos").insert({
            user_id: getDeviceId(),
            lat: latitude,
            lng: longitude,
            created_at: new Date().toISOString(),
          });
        }
      } catch {
        // best-effort
      }
    }

    // Reset the timer after 3 s so the user can continue walking
    setTimeout(() => {
      setSosFired(false);
      setRemaining(DURATION_S);
    }, 3_000);
  }, []);

  // Countdown tick
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          void fireSOS();
          return DURATION_S;
        }
        return prev - 1;
      });
    }, 1_000);
    return () => clearInterval(id);
  }, [fireSOS]);

  const handleSafe = useCallback(() => {
    setRemaining(DURATION_S);
    setSosFired(false);
  }, []);

  const progress = remaining / DURATION_S;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isUrgent = remaining <= 60 && !sosFired;

  return (
    <div className="pointer-events-auto fixed bottom-36 right-4 z-[125] w-[min(20rem,calc(100vw-5.5rem))] sm:right-6">
      <div
        className={cn(
          "relative rounded-2xl border bg-black/95 p-4 shadow-2xl backdrop-blur-xl transition-colors duration-500",
          sosFired
            ? "border-red-500/60 shadow-red-900/50"
            : isUrgent
              ? "border-orange-500/40 shadow-orange-900/30"
              : "border-white/10 shadow-black/40",
        )}
      >
        {/* End button */}
        <button
          onClick={onEnd}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-lg text-gray-600 transition-colors hover:text-gray-300"
          aria-label="End safe walk"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-4">
          {/* Countdown ring */}
          <div className="relative flex items-center justify-center">
            <svg width="88" height="88" className="-rotate-90" aria-hidden>
              {/* Track */}
              <circle
                cx="44" cy="44" r={RADIUS}
                fill="none" strokeWidth="4"
                className="stroke-white/10"
              />
              {/* Progress */}
              <circle
                cx="44" cy="44" r={RADIUS}
                fill="none" strokeWidth="4"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className={cn(
                  "transition-all duration-1000",
                  sosFired
                    ? "stroke-red-500"
                    : isUrgent
                      ? "stroke-orange-400"
                      : "stroke-green-400",
                )}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {sosFired ? (
                <AlertTriangle className="h-6 w-6 animate-pulse text-red-400" />
              ) : (
                <>
                  <p className={cn(
                    "text-lg font-bold tabular-nums leading-none",
                    isUrgent ? "text-orange-400" : "text-white",
                  )}>
                    {mins}:{secs.toString().padStart(2, "0")}
                  </p>
                  <p className="mt-0.5 text-[9px] text-gray-500">left</p>
                </>
              )}
            </div>
          </div>

          {/* Label + action */}
          <div className="flex flex-col gap-2.5">
            <div>
              <p className="text-xs font-bold text-white">Safe Walk</p>
              <p className={cn(
                "text-[10px]",
                sosFired ? "text-red-400 font-semibold" : isUrgent ? "text-orange-400" : "text-gray-500",
              )}>
                {sosFired
                  ? "Friends in your room notified!"
                  : isUrgent
                    ? "Tap now if you're safe!"
                    : "Tap every 5 min to check in"}
              </p>
            </div>

            <button
              onClick={handleSafe}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all active:scale-95",
                sosFired
                  ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/40"
                  : isUrgent
                    ? "animate-pulse bg-orange-500 text-white shadow-lg shadow-orange-500/40 hover:bg-orange-400"
                    : "bg-green-500/20 text-green-300 ring-1 ring-green-500/30 hover:bg-green-500/30",
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              I&apos;m Safe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

