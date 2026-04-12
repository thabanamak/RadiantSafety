"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Users, ChevronLeft, ChevronRight, MapPin, Copy, Check, LogOut, Radio, AlertTriangle, X as XIcon, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getDeviceId } from "@/lib/identity";
import type { AuthUser } from "@/lib/auth-storage";
import type { FriendLocation } from "@/components/RadiantMap";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoomMember {
  id: string;
  room_code: string;
  device_id: string;
  /** Current column name after migration */
  host_name?: string | null;
  /** Legacy column name — kept for backwards-compat with old rows */
  display_name?: string | null;
  lat: number;
  lng: number;
  updated_at: string;
}

interface FindMyControllerProps {
  userCoords: { latitude: number; longitude: number } | null;
  onFriendLocationsChange: (locations: FriendLocation[]) => void;
  /** When set, the friend-room display name uses the account name (no manual name field). */
  authUser?: AuthUser | null;
  /** Controlled open state — when provided the parent can close the panel externally. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function findMyAccountLabel(authUser: AuthUser | null | undefined): string | null {
  if (!authUser?.id) return null;
  const name = authUser.name?.trim();
  if (name) return name.slice(0, 20);
  const email = authUser.email?.trim();
  const local = email?.includes("@") ? email.split("@")[0]!.trim() : email;
  if (local) return local.slice(0, 20);
  return `User ${authUser.id.replace(/-/g, "").slice(0, 4)}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function roomMemberLabel(member: Pick<RoomMember, "host_name" | "display_name" | "device_id">): string {
  const raw =
    typeof member.host_name === "string" ? member.host_name.trim()
    : typeof member.display_name === "string" ? member.display_name.trim()
    : "";
  if (raw) return raw;
  const short = member.device_id.replace(/-/g, "").slice(0, 4);
  return short ? `Guest ${short}` : "Guest";
}

function roomMemberInitial(member: Pick<RoomMember, "host_name" | "display_name" | "device_id">): string {
  const ch = roomMemberLabel(member).charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

const STORAGE_ROOM_KEY = "radiant_findmy_room";
const STORAGE_NAME_KEY = "radiant_findmy_name";
const SHARE_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FindMyController({
  userCoords,
  onFriendLocationsChange,
  authUser,
  open: openProp,
  onOpenChange,
}: FindMyControllerProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp !== undefined ? openProp : openInternal;
  const setOpen = (v: boolean) => {
    setOpenInternal(v);
    onOpenChange?.(v);
  };

  // Room + identity state
  const [roomCode, setRoomCode] = useState<string>("");
  const [roomInput, setRoomInput] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Friends list
  const [members, setMembers] = useState<RoomMember[]>([]);

  // Safe Walk alert from a room member
  const [safeWalkAlert, setSafeWalkAlert] = useState<{
    name: string;
    firedAt: string;
  } | null>(null);
  const safeWalkAlertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks which device_ids in the room are currently in safe walk mode
  const [safeWalkDevices, setSafeWalkDevices] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const shareIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deviceId = useRef<string>("");

  const accountLabel = findMyAccountLabel(authUser);

  // Restore persisted room on mount
  useEffect(() => {
    deviceId.current = getDeviceId();
    const savedRoom = localStorage.getItem(STORAGE_ROOM_KEY) ?? "";
    if (savedRoom) {
      setRoomCode(savedRoom);
      setRoomInput(savedRoom);
      setInRoom(true);
    }
  }, []);

  // Display name: signed-in users use their account label; guests use saved name or a device fallback.
  useEffect(() => {
    if (!deviceId.current) deviceId.current = getDeviceId();
    if (accountLabel) {
      setDisplayName(accountLabel);
      setNameInput(accountLabel);
      localStorage.setItem(STORAGE_NAME_KEY, accountLabel);
      return;
    }
    const savedName = localStorage.getItem(STORAGE_NAME_KEY) ?? "";
    if (savedName) {
      setDisplayName(savedName);
      setNameInput(savedName);
    } else {
      const fallback = `Friend ${deviceId.current.slice(0, 4).toUpperCase()}`;
      setDisplayName(fallback);
      setNameInput(fallback);
    }
  }, [accountLabel]);

  // Fetch existing members via API (uses service key — bypasses RLS)
  const fetchMembers = useCallback(async (code: string) => {
    try {
      const res = await fetch(`/api/friends/share?room_code=${encodeURIComponent(code.toUpperCase())}`);
      if (!res.ok) return;
      const json = (await res.json()) as { members?: RoomMember[] };
      if (json.members) setMembers(json.members);
    } catch {
      /* ignore network errors */
    }
  }, []);

  useEffect(() => {
    if (inRoom && roomCode) fetchMembers(roomCode);
  }, [inRoom, roomCode, fetchMembers]);

  // Polling fallback — re-fetch the full member list every 3 s while in a room.
  // This guarantees the friends list stays current even when the Realtime filtered
  // subscription misses events (e.g. RLS policy not set up for postgres_changes).
  useEffect(() => {
    if (!inRoom || !roomCode) return;
    const id = setInterval(() => fetchMembers(roomCode), 3_000);
    return () => clearInterval(id);
  }, [inRoom, roomCode, fetchMembers]);

  // Realtime subscription — postgres_changes for member list + broadcast for safe walk alerts
  useEffect(() => {
    if (!inRoom || !roomCode) return;

    const sb = getSupabaseBrowser();
    if (!sb) return;

    const channel = sb
      .channel(`findmy-room-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_locations",
          filter: `room_code=eq.${roomCode.toUpperCase()}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setMembers((prev) => prev.filter((m) => m.id !== (payload.old as RoomMember).id));
          } else {
            const row = payload.new as RoomMember;
            setMembers((prev) => {
              const idx = prev.findIndex((m) => m.device_id === row.device_id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = row;
                return next;
              }
              return [...prev, row];
            });
          }
        }
      )
      .on(
        "broadcast",
        { event: "safewalk_status" },
        (msg) => {
          const payload = msg.payload as {
            device_id?: string;
            active?: boolean;
          };
          if (!payload.device_id) return;
          setSafeWalkDevices((prev) => {
            const next = new Set(prev);
            if (payload.active) {
              next.add(payload.device_id!);
            } else {
              next.delete(payload.device_id!);
            }
            return next;
          });
        }
      )
      .on(
        "broadcast",
        { event: "safewalk_expired" },
        (msg) => {
          const payload = msg.payload as {
            device_id?: string;
            display_name?: string;
            fired_at?: string;
          };
          // Only show to other room members, not the person who triggered it
          if (payload.device_id && payload.device_id === deviceId.current) return;
          const name = payload.display_name || "A friend";
          const firedAt = payload.fired_at ?? new Date().toISOString();
          setSafeWalkAlert({ name, firedAt });
          // Auto-dismiss after 30 seconds
          if (safeWalkAlertTimeoutRef.current) clearTimeout(safeWalkAlertTimeoutRef.current);
          safeWalkAlertTimeoutRef.current = setTimeout(() => setSafeWalkAlert(null), 30_000);
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [inRoom, roomCode]);

  // Push friend locations to map (exclude self)
  useEffect(() => {
    const friends = members
      .filter((m) => m.device_id !== deviceId.current)
      .map((m) => ({
        id: m.device_id,
        lat: m.lat,
        lng: m.lng,
        name: roomMemberLabel(m),
      }));
    onFriendLocationsChange(friends);
  }, [members, onFriendLocationsChange]);

  // Location sharing interval
  const doShare = useCallback(async () => {
    if (!userCoords || !roomCode || !deviceId.current) return;
    try {
      const res = await fetch("/api/friends/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_code: roomCode,
          device_id: deviceId.current,
          host_name: displayName,
          lat: userCoords.latitude,
          lng: userCoords.longitude,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { members?: RoomMember[] };
        if (json.members) setMembers(json.members);
      }
    } catch {
      /* ignore */
    }
  }, [userCoords, roomCode, displayName]);

  useEffect(() => {
    if (sharing && inRoom) {
      doShare();
      shareIntervalRef.current = setInterval(doShare, SHARE_INTERVAL_MS);
    } else {
      if (shareIntervalRef.current) clearInterval(shareIntervalRef.current);
    }
    return () => { if (shareIntervalRef.current) clearInterval(shareIntervalRef.current); };
  }, [sharing, inRoom, doShare]);

  // Join or create a room
  const handleJoin = useCallback(async (code?: string) => {
    const targetCode = (code ?? roomInput).trim().toUpperCase();
    if (!targetCode || targetCode.length < 4) {
      setJoinError("Enter at least 4 characters");
      return;
    }
    const name = nameInput.trim() || displayName;
    setJoining(true);
    setJoinError("");
    try {
      let joinedMembers: RoomMember[] | null = null;
      if (userCoords) {
        const res = await fetch("/api/friends/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_code: targetCode,
            device_id: deviceId.current,
            host_name: name,
            lat: userCoords.latitude,
            lng: userCoords.longitude,
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as { members?: RoomMember[] };
          if (json.members) joinedMembers = json.members;
        }
      }
      setRoomCode(targetCode);
      setDisplayName(name);
      setInRoom(true);
      setSharing(!!userCoords);
      localStorage.setItem(STORAGE_ROOM_KEY, targetCode);
      localStorage.setItem(STORAGE_NAME_KEY, name);
      // Use members from the join response, or fall back to a separate fetch
      if (joinedMembers) {
        setMembers(joinedMembers);
      } else {
        void fetchMembers(targetCode);
      }
    } finally {
      setJoining(false);
    }
  }, [roomInput, nameInput, displayName, userCoords, fetchMembers]);

  const handleCreate = useCallback(() => {
    const code = generateRoomCode();
    setRoomInput(code);
    handleJoin(code);
  }, [handleJoin]);

  const handleLeave = useCallback(async () => {
    if (!roomCode) return;
    setSharing(false);
    await fetch("/api/friends/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_code: roomCode, device_id: deviceId.current }),
    });
    setInRoom(false);
    setMembers([]);
    setSafeWalkDevices(new Set());
    setRoomCode("");
    setRoomInput("");
    onFriendLocationsChange([]);
    localStorage.removeItem(STORAGE_ROOM_KEY);
  }, [roomCode, onFriendLocationsChange]);

  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [roomCode]);

  const friendCount = members.filter((m) => m.device_id !== deviceId.current).length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      {/* Safe Walk expired alert — shown to room members only, not the person who triggered it */}
      {safeWalkAlert && (
        <div className="pointer-events-auto fixed inset-0 z-[200] flex items-center justify-center px-5">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setSafeWalkAlert(null);
              if (safeWalkAlertTimeoutRef.current) clearTimeout(safeWalkAlertTimeoutRef.current);
            }}
          />

          {/* Card */}
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border-2 border-orange-500/60 bg-black/98 shadow-[0_0_80px_rgba(249,115,22,0.4)] backdrop-blur-xl">
            <div className="pointer-events-none absolute -inset-px animate-pulse rounded-3xl bg-orange-500/15 blur-sm" />

            <div className="relative px-6 py-7">
              {/* Dismiss */}
              <button
                type="button"
                onClick={() => {
                  setSafeWalkAlert(null);
                  if (safeWalkAlertTimeoutRef.current) clearTimeout(safeWalkAlertTimeoutRef.current);
                }}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300"
                aria-label="Dismiss"
              >
                <XIcon className="h-4 w-4" />
              </button>

              {/* Icon */}
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500/20 ring-2 ring-orange-500/50">
                <AlertTriangle className="h-10 w-10 animate-pulse text-orange-400" />
              </div>

              {/* Label */}
              <p className="mb-2 text-center text-sm font-black uppercase tracking-widest text-orange-400">Safe Walk Alert</p>

              {/* Name */}
              <p className="text-center text-2xl font-black text-white">{safeWalkAlert.name}</p>
              <p className="mt-1 text-center text-base font-semibold text-orange-300">didn&apos;t check in</p>
              <p className="mt-1.5 text-center text-sm text-gray-400">They may need help — check in with them.</p>

              {/* Dismiss button */}
              <button
                type="button"
                onClick={() => {
                  setSafeWalkAlert(null);
                  if (safeWalkAlertTimeoutRef.current) clearTimeout(safeWalkAlertTimeoutRef.current);
                }}
                className="mt-6 w-full rounded-2xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-gray-300 transition-all hover:bg-white/10 active:scale-95"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-auto flex items-start gap-0">
      {/* Toggle tab */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex h-10 w-8 items-center justify-center rounded-r-xl border border-l-0 transition-all",
          "border-white/15 bg-black/90 shadow-lg backdrop-blur-xl",
          "hover:bg-white/10 active:scale-95"
        )}
        aria-label={open ? "Close Find My panel" : "Open Find My Friends"}
      >
        <Users className={cn("h-4 w-4", inRoom && sharing ? "text-teal-400 animate-pulse" : inRoom ? "text-teal-500" : "text-gray-500")} />
        {friendCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-teal-500 text-[9px] font-bold text-white shadow">
            {friendCount}
          </span>
        )}
        <span className="absolute bottom-0 right-0">
          {open
            ? <ChevronLeft className="h-2.5 w-2.5 text-gray-600" />
            : <ChevronRight className="h-2.5 w-2.5 text-gray-600" />
          }
        </span>
      </button>

      {/* Panel */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out",
          open ? "w-72 overflow-visible opacity-100" : "w-0 overflow-hidden opacity-0"
        )}
      >
        <div className="w-72 rounded-r-2xl border border-l-0 border-teal-500/20 bg-black/95 shadow-2xl shadow-teal-900/30 backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/20">
                <Users className="h-3 w-3 text-teal-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Find My Friends</p>
                <p className="text-[10px] text-gray-500">
                  {inRoom ? `Room ${roomCode} · ${members.length} here` : "Share location with friends"}
                </p>
              </div>
            </div>
            {inRoom && sharing && (
              <span className="flex items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-[9px] font-semibold text-teal-400">
                <Radio className="h-2.5 w-2.5 animate-pulse" />
                Live
              </span>
            )}
          </div>

          {/* Body */}
          <div className="px-4 py-3">
            {!inRoom ? (
              /* ── Join / Create flow ─────────────────────────────────── */
              <div className="flex flex-col gap-3">
                {accountLabel ? (
                  <p className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-[11px] text-gray-400">
                    <span className="font-semibold uppercase tracking-wider text-gray-500">Sharing as </span>
                    <span className="text-white">{accountLabel}</span>
                  </p>
                ) : (
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Your name
                    </label>
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="How friends see you"
                      maxLength={20}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-gray-600 outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30 transition-colors"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Room code
                  </label>
                  <input
                    type="text"
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                    placeholder="Ask a friend for their code"
                    maxLength={8}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder-gray-600 outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30 transition-colors"
                  />
                  {joinError && <p className="mt-1 text-[10px] text-red-400">{joinError}</p>}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleJoin()}
                    disabled={joining || !roomInput.trim()}
                    className="flex-1 rounded-lg bg-teal-500/20 py-2 text-xs font-semibold text-teal-300 transition-colors hover:bg-teal-500/30 disabled:opacity-40"
                  >
                    {joining ? "Joining…" : "Join room"}
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={joining}
                    className="flex-1 rounded-lg bg-white/5 py-2 text-xs font-semibold text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-40"
                  >
                    Create new
                  </button>
                </div>
              </div>
            ) : (
              /* ── In-room view ───────────────────────────────────────── */
              <div className="flex flex-col gap-3">
                {/* Room code row */}
                <div className="flex items-center justify-between rounded-xl border border-teal-500/20 bg-teal-500/5 px-3 py-2">
                  <div>
                    <p className="text-[10px] text-gray-500">Room code</p>
                    <p className="font-mono text-sm font-bold tracking-widest text-teal-300">{roomCode}</p>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    title="Copy code"
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-400 transition-colors hover:bg-teal-500/20"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Share toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-white">Share my location</p>
                    <p className="text-[10px] text-gray-500">
                      {!userCoords ? "Enable device location first" : sharing ? "Updating every 5s" : "Off — friends can't see you"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (sharing) {
                        // Turning OFF — stop interval and remove our row from the DB
                        // so other members immediately stop seeing our location.
                        setSharing(false);
                        if (roomCode && deviceId.current) {
                          await fetch("/api/friends/leave", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              room_code: roomCode,
                              device_id: deviceId.current,
                            }),
                          });
                          // Remove self from local list; others will vanish via polling
                          setMembers((prev) =>
                            prev.filter((m) => m.device_id !== deviceId.current)
                          );
                        }
                      } else {
                        // Turning ON — only allowed when we have GPS coords
                        if (!userCoords) return;
                        setSharing(true);
                      }
                    }}
                    disabled={!userCoords && !sharing}
                    aria-label="Toggle location sharing"
                    style={{
                      position: "relative",
                      display: "inline-block",
                      width: 44,
                      height: 24,
                      borderRadius: 9999,
                      flexShrink: 0,
                      background: sharing ? "#3b82f6" : "#4b5563",
                      transition: "background 300ms",
                      opacity: (!userCoords && !sharing) ? 0.4 : 1,
                      cursor: (!userCoords && !sharing) ? "not-allowed" : "pointer",
                    }}
                  >
                    <span
                      className="pointer-events-none rounded-full bg-white shadow-md"
                      style={{
                        position: "absolute",
                        top: 2,
                        left: 2,
                        width: 20,
                        height: 20,
                        transform: sharing ? "translateX(20px)" : "translateX(0px)",
                        transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                    />
                  </button>
                </div>

                {/* Friends list */}
                {members.length > 0 && (
                  <div className="max-h-52 overflow-y-auto">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      {members.length} {members.length === 1 ? "person" : "people"} in room
                    </p>
                    <ul className="flex flex-col gap-1">
                      {members.map((member) => {
                        const isMe = member.device_id === deviceId.current;
                        const isSafeWalking = safeWalkDevices.has(member.device_id);
                        const dist = userCoords
                          ? haversine(userCoords.latitude, userCoords.longitude, member.lat, member.lng)
                          : null;
                        return (
                          <li
                            key={member.device_id}
                            className={cn(
                              "flex items-center gap-2.5 rounded-xl px-2.5 py-2",
                              isMe ? "bg-teal-500/10" : "bg-white/3 hover:bg-white/5"
                            )}
                          >
                            <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-900/60 ring-1 ring-teal-500/30 text-xs font-bold text-teal-300">
                              {roomMemberInitial(member)}
                              {isMe && (
                                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-black bg-teal-400" />
                              )}
                              {isSafeWalking && !isMe && (
                                <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border border-black bg-green-500">
                                  <ShieldCheck className="h-2 w-2 text-white" />
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1 truncate text-xs font-semibold text-white">
                                {roomMemberLabel(member)}
                                {isMe && (
                                  <span className="text-[9px] font-normal text-teal-500">
                                    (you)
                                  </span>
                                )}
                                {isSafeWalking && (
                                  <span title="Safe Walk active">
                                    <ShieldCheck className="h-3 w-3 shrink-0 text-green-400" />
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-gray-600">
                                {isSafeWalking
                                  ? <span className="text-green-500/80">Safe Walk active</span>
                                  : timeAgo(member.updated_at)
                                }
                              </p>
                            </div>
                            {!isMe && dist !== null && (
                              <div className="shrink-0 text-right">
                                <p className="text-[10px] text-gray-500">
                                  {dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`}
                                </p>
                                <MapPin className="ml-auto h-2.5 w-2.5 text-gray-700" />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Leave button */}
                <button
                  onClick={handleLeave}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 py-1.5 text-[11px] font-semibold text-gray-500 transition-colors hover:border-red-500/30 hover:text-red-400"
                >
                  <LogOut className="h-3 w-3" />
                  Leave room
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
