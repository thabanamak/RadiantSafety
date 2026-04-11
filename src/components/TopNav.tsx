"use client";

import Link from "next/link";
import {
  LogIn,
  UserPlus,
  LogOut,
  ChevronDown,
  ShieldAlert,
  Users,
  Navigation,
  UserCircle,
  Settings,
  Shield,
  Hospital,
  Upload,
  Loader2,
  X,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import type { UserReputation } from "@/lib/types";
import type { AuthUser } from "@/lib/auth-storage";
import SearchBar from "./SearchBar";
import MapVisibilitySwitch from "@/components/MapVisibilitySwitch";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { IntensityFilter } from "@/lib/map-crime-intensity-filter";

export type { AuthUser };

export type DashboardTab = "news";
export type IncidentTab = "official" | "user-reported";

const CRIME_INTENSITY_SEGMENTS: {
  id: IntensityFilter;
  label: string;
  title: string;
}[] = [
  { id: "all", label: "All", title: "Show all severities (default)" },
  { id: "low", label: "Low", title: "Intensity 1–4" },
  { id: "medium", label: "Med", title: "Intensity 5–7" },
  { id: "high", label: "High", title: "Intensity 8–10" },
];

interface TopNavProps {
  reputation: UserReputation;
  user: AuthUser | null;
  mapCenter?: { latitude: number; longitude: number } | null;
  activeIncidentTab: IncidentTab;
  onIncidentTabChange: (tab: IncidentTab) => void;
  onSearchSelectArea: (payload: {
    latitude: number;
    longitude: number;
    zoom: number;
    placeName: string;
    center: [number, number];
  }) => void;
  onLogout: () => void;
  directionsMode?: boolean;
  onDirectionsModeChange?: (active: boolean) => void;
  showPoliceOnMap: boolean;
  onShowPoliceOnMapChange: (next: boolean) => void;
  showHealthFacilitiesOnMap: boolean;
  onShowHealthFacilitiesOnMapChange: (next: boolean) => void;
  routingActive?: boolean;
  /** Merge into signed-in user after profile updates (e.g. responder verification). */
  onAuthUserPatch?: (patch: Partial<AuthUser>) => void;
  crimeIntensityFilter: IntensityFilter;
  onCrimeIntensityFilterChange: (next: IntensityFilter) => void;
}

export default function TopNav({
  reputation,
  user,
  mapCenter,
  activeIncidentTab,
  onIncidentTabChange,
  onSearchSelectArea,
  onLogout,
  directionsMode = false,
  onDirectionsModeChange,
  showPoliceOnMap,
  onShowPoliceOnMapChange,
  showHealthFacilitiesOnMap,
  onShowHealthFacilitiesOnMapChange,
  routingActive = false,
  onAuthUserPatch,
  crimeIntensityFilter,
  onCrimeIntensityFilterChange,
}: TopNavProps) {
  const [crimeLayerOpen, setCrimeLayerOpen] = useState(false);

  return (
    <nav className="pointer-events-auto absolute inset-x-0 top-0 z-[140] flex flex-col bg-gradient-to-b from-black/85 via-black/60 to-transparent pb-4">
      <div className="relative z-50 flex items-center gap-4 px-5 py-3">
        <div className="flex shrink-0 items-center gap-3">
          {user && (
            <>
              <div className="h-4 w-px bg-gray-700" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-100">
                  {reputation.score}%
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    reputation.isTrusted
                      ? "bg-radiant-green/20 text-radiant-green"
                      : "bg-yellow-500/20 text-yellow-400"
                  )}
                >
                  {reputation.label}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {user ? (
            <AccountDropdown
              user={user}
              reputation={reputation}
              onLogout={onLogout}
              onAuthUserPatch={onAuthUserPatch}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="flex items-center gap-1.5 rounded-lg border border-radiant-border px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
              >
                <LogIn className="h-3.5 w-3.5" />
                Log In
              </Link>
              <Link
                href="/signup"
                className="flex items-center gap-1.5 rounded-lg bg-radiant-red px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-red-500/20 transition-all hover:shadow-red-500/40"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-3 px-5">
        <div className="flex w-full max-w-2xl flex-col gap-1.5">
          <SearchBar
            mapCenter={mapCenter}
            onSelectArea={onSearchSelectArea}
            endAdornment={
              onDirectionsModeChange ? (
                <button
                  type="button"
                  onClick={() => onDirectionsModeChange(!directionsMode)}
                  aria-pressed={directionsMode}
                  aria-label={directionsMode ? "Exit directions" : "Open directions"}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 border-l border-white/10 py-1 pl-2.5 text-[11px] font-semibold transition-colors sm:gap-2 sm:pl-3 sm:text-xs",
                    directionsMode
                      ? "text-cyan-300"
                      : "text-gray-400 hover:text-gray-200"
                  )}
                >
                  <Navigation className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">
                    {directionsMode ? "Exit" : "Directions"}
                  </span>
                </button>
              ) : null
            }
          />
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 sm:gap-x-6">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Police
              </span>
              <MapVisibilitySwitch
                id="toggle-police-map"
                on={showPoliceOnMap}
                onToggle={() => onShowPoliceOnMapChange(!showPoliceOnMap)}
                activeClass="bg-sky-600 focus-visible:ring-sky-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Hospital
                className="h-3.5 w-3.5 shrink-0 text-red-400"
                strokeWidth={2.25}
                aria-hidden
              />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Medical
              </span>
              <MapVisibilitySwitch
                id="toggle-medical-map"
                on={showHealthFacilitiesOnMap}
                onToggle={() =>
                  onShowHealthFacilitiesOnMapChange(!showHealthFacilitiesOnMap)
                }
                activeClass="bg-red-600 focus-visible:ring-red-500"
              />
            </div>
          </div>
        </div>

        {/* Incident tab pills + collapsible crime layer filter */}
        {!routingActive && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-1 backdrop-blur-md shadow-lg transition-opacity duration-300">
              <button
                type="button"
                onClick={() => onIncidentTabChange("official")}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-semibold transition-all",
                  activeIncidentTab === "official"
                    ? "bg-radiant-red text-white shadow-md shadow-red-500/30"
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Official Incidents
              </button>
              <button
                type="button"
                onClick={() => onIncidentTabChange("user-reported")}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-semibold transition-all",
                  activeIncidentTab === "user-reported"
                    ? "bg-radiant-red text-white shadow-md shadow-red-500/30"
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                <Users className="h-3.5 w-3.5" />
                User Reported
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 shadow-lg backdrop-blur-md">
              <button
                type="button"
                onClick={() => setCrimeLayerOpen((o) => !o)}
                aria-expanded={crimeLayerOpen}
                className="flex w-full min-w-0 items-center gap-2 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-white/5"
              >
                <Layers className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Crime data layer
                </span>
                <ChevronDown
                  className={cn(
                    "ml-auto h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200",
                    crimeLayerOpen && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>
              {crimeLayerOpen ? (
                <div className="border-t border-white/10 px-2 pb-2 pt-1.5">
                  <div
                    role="toolbar"
                    aria-label="Heatmap intensity filter"
                    className="flex max-w-[17rem] flex-wrap gap-0.5 rounded-lg bg-black/35 p-0.5 ring-1 ring-white/5 sm:max-w-[18rem]"
                  >
                    {CRIME_INTENSITY_SEGMENTS.map(({ id, label, title }) => {
                      const active = crimeIntensityFilter === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          title={title}
                          aria-pressed={active}
                          onClick={() => onCrimeIntensityFilterChange(id)}
                          className={cn(
                            "min-h-[36px] min-w-[2.75rem] flex-1 rounded-md px-2 py-1.5 text-center text-[11px] font-semibold tracking-tight transition-[color,background-color,box-shadow,transform] duration-200 ease-out sm:text-xs",
                            active
                              ? "bg-gradient-to-b from-orange-500/95 to-orange-600/95 text-white shadow-md shadow-orange-900/40 ring-1 ring-orange-300/35"
                              : "text-neutral-400 hover:bg-white/8 hover:text-neutral-100 active:scale-[0.98]"
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

const RESPONDER_VERIFY_MIN_MS = 1500;

function ResponderVerifyModal({
  open,
  userId,
  onClose,
  onVerified,
}: {
  open: boolean;
  userId: string;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setPickedName(null);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  const handleSubmit = useCallback(async () => {
    if (!pickedName) {
      setError("Please upload a photo of your ID or credentials first.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const minDelay = new Promise<void>((r) => {
      window.setTimeout(r, RESPONDER_VERIFY_MIN_MS);
    });
    const { client, error: cfgErr } = getSupabaseBrowserClient();
    if (cfgErr || !client) {
      await minDelay;
      setSubmitting(false);
      setError(cfgErr ?? "Could not connect.");
      return;
    }
    const updatePromise = client
      .from("profiles")
      .update({
        is_responder: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    const [, result] = await Promise.all([minDelay, updatePromise]);
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message ?? "Update failed.");
      return;
    }
    onVerified();
    onClose();
  }, [onClose, onVerified, pickedName, userId]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[220] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="responder-verify-title"
    >
      <button
        type="button"
        aria-label="Close"
        disabled={submitting}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity disabled:cursor-wait"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-radiant-border bg-radiant-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-radiant-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-sky-400" aria-hidden />
            <h2
              id="responder-verify-title"
              className="text-sm font-semibold text-gray-100"
            >
              First responder verification
            </h2>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={() => !submitting && onClose()}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-radiant-card hover:text-white disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-4 py-4">
          <p className="text-xs leading-relaxed text-gray-400">
            Upload a clear photo of your official ID or service credentials. For
            this demo the image is not sent anywhere; Submit only marks your
            account after a short review step.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPickedName(f ? f.name : null);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-radiant-border bg-radiant-card px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              Choose file
            </button>
            <span className="truncate text-[11px] text-gray-500">
              {pickedName ?? "No file chosen — tap Choose file"}
            </span>
          </div>
          {!pickedName && !error ? (
            <p className="text-[11px] text-amber-400/90">
              Choose a photo before you can submit for verification.
            </p>
          ) : null}
          {error ? (
            <p className="text-xs text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-radiant-border bg-black/20 px-4 py-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => !submitting && onClose()}
            className="rounded-lg px-3 py-2 text-xs font-medium text-gray-400 transition-colors hover:bg-radiant-card hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || !pickedName}
            onClick={() => void handleSubmit()}
            className="flex min-w-[7rem] items-center justify-center gap-2 rounded-lg bg-radiant-red px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-red-500/25 transition-all hover:shadow-red-500/40 disabled:pointer-events-none disabled:opacity-40"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Submitting…
              </>
            ) : (
              "Submit"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function AccountDropdown({
  user,
  reputation,
  onLogout,
  onAuthUserPatch,
}: {
  user: AuthUser;
  reputation: UserReputation;
  onLogout: () => void;
  onAuthUserPatch?: (patch: Partial<AuthUser>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isResponder = Boolean(user.isResponder);
  const userId = user.id?.trim() ?? "";

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const menuPanel = open && menuPos && (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "fixed",
        top: menuPos.top,
        right: menuPos.right,
        width: 288,
      }}
      className="z-[300] rounded-xl border border-radiant-border bg-radiant-surface/98 p-1.5 shadow-2xl backdrop-blur-xl"
    >
      <div className="space-y-2.5 px-3 py-3">
        <p className="truncate text-xs font-medium text-gray-100" title={user.email}>
          {user.email}
        </p>
        <div>
          {isResponder ? (
            <span className="inline-flex rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
              Verified Responder
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-gray-600/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-300">
              Standard User
            </span>
          )}
        </div>
        {!isResponder && userId ? (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setVerifyOpen(true);
              setOpen(false);
            }}
            className="flex w-full items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200 transition-colors hover:border-sky-400/60 hover:bg-sky-500/20"
          >
            Verify as First Responder
          </button>
        ) : null}
        {!isResponder && !userId ? (
          <p className="text-[10px] leading-snug text-amber-400/90">
            Your session has no user id yet (common in some embedded browsers). Refresh the page or open this app in
            a normal browser window, then try again.
          </p>
        ) : null}
      </div>

      <div className="mx-2 mb-2 rounded-lg border border-radiant-border bg-radiant-card/80 px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Reputation</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-lg font-bold tabular-nums text-gray-100">{reputation.score}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              reputation.isTrusted
                ? "bg-radiant-green/20 text-radiant-green"
                : "bg-gray-600/40 text-gray-300"
            )}
          >
            {reputation.label}
          </span>
        </div>
      </div>

      <div className="my-1 h-px bg-radiant-border" />

      <Link
        href="/profile"
        role="menuitem"
        onClick={() => setOpen(false)}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-radiant-card hover:text-white"
      >
        <Settings className="h-3.5 w-3.5 shrink-0 text-gray-500" />
        Manage your profile
      </Link>

      <div className="my-1 h-px bg-radiant-border" />
      <button
        type="button"
        onClick={() => {
          void onLogout();
          setOpen(false);
        }}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-gray-400 transition-colors hover:bg-radiant-card hover:text-gray-200"
      >
        <LogOut className="h-3.5 w-3.5" />
        Log out
      </button>
    </div>
  );

  return (
    <>
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex items-center gap-1 rounded-full border border-radiant-border p-1 pr-2 transition-colors hover:border-gray-500",
          open && "border-gray-500"
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-radiant-red/15 text-radiant-red">
          <UserCircle className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <span className="hidden items-center gap-2 text-xs font-medium text-gray-300 lg:flex">
          {user.name}
          {user.over18Verified && (
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-400">
              18+ verified
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "hidden h-3.5 w-3.5 text-gray-500 transition-transform sm:block",
            open && "rotate-180"
          )}
        />
      </button>
    </div>
    {typeof document !== "undefined" && menuPanel ? createPortal(menuPanel, document.body) : null}
    {userId ? (
      <ResponderVerifyModal
        open={verifyOpen}
        userId={userId}
        onClose={() => setVerifyOpen(false)}
        onVerified={() => onAuthUserPatch?.({ isResponder: true })}
      />
    ) : null}
    </>
  );
}
