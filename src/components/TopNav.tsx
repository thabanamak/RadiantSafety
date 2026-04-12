"use client";

import Link from "next/link";
import {
  LogOut,
  ChevronDown,
  ShieldAlert,
  Users,
  Navigation,
  UserCircle,
  Settings,
  Upload,
  Loader2,
  X,
  ShieldCheck,
  Gauge,
  Signal,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import type { UserReputation } from "@/lib/types";
import type { AuthUser } from "@/lib/auth-storage";
import SearchBar from "./SearchBar";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { IntensityFilter, DataSourceFilter } from "@/lib/map-crime-intensity-filter";

export type { AuthUser };

export type DashboardTab = "news";
export type IncidentTab = "official" | "user-reported";

const CRIME_INTENSITY_SEGMENTS: {
  id: IntensityFilter;
  label: string;
  title: string;
}[] = [
  { id: "all", label: "All", title: "Show all severities (default)" },
  { id: "high", label: "High", title: "Intensity 8–10" },
  { id: "medium", label: "Med", title: "Intensity 5–7" },
  { id: "low", label: "Low", title: "Intensity 1–4" },
];

const DATA_SOURCE_SEGMENTS: {
  id: DataSourceFilter;
  label: string;
  title: string;
}[] = [
  { id: "all",        label: "All",     title: "Combined: 2025 archive + live feed" },
  { id: "historical", label: "2025",    title: "2025 archive data only" },
  { id: "live",       label: "Live",    title: "Live scraped VicPol feed only" },
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
  routingActive?: boolean;
  /** Merge into signed-in user after profile updates (e.g. responder verification). */
  onAuthUserPatch?: (patch: Partial<AuthUser>) => void;
  crimeIntensityFilter: IntensityFilter;
  onCrimeIntensityFilterChange: (next: IntensityFilter) => void;
  dataSourceFilter: DataSourceFilter;
  onDataSourceFilterChange: (next: DataSourceFilter) => void;
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
  routingActive = false,
  onAuthUserPatch,
  crimeIntensityFilter,
  onCrimeIntensityFilterChange,
  dataSourceFilter,
  onDataSourceFilterChange,
}: TopNavProps) {
  const [severityOpen, setSeverityOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  /** Mapbox GL can promote the map above in-tree siblings; portal keeps chrome clickable. */
  const [navPortaled, setNavPortaled] = useState(false);
  useLayoutEffect(() => {
    setNavPortaled(true);
  }, []);

  const nav = (
    <nav className="pointer-events-none fixed inset-x-0 top-0 z-[10000] flex flex-col bg-gradient-to-b from-black/70 via-black/40 to-transparent pb-4">
      <div className="pointer-events-auto relative z-50 flex items-center gap-4 px-5 py-3">
        <div className="flex shrink-0 items-center gap-3">
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
            <Link
              href="/signup"
              className="flex items-center gap-1.5 rounded-lg bg-radiant-red px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-red-500/20 transition-all hover:shadow-red-500/40"
            >
              Get Started
            </Link>
          )}
        </div>
      </div>

      <div className="pointer-events-none relative z-10 flex flex-col items-center gap-3 px-5">
        <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-1.5">
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
        </div>

        {/* Incident tab pills + collapsible crime layer filter */}
        {!routingActive && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
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

            <div className="relative rounded-2xl border border-white/10 bg-black/40 shadow-lg backdrop-blur-md">
              <button
                type="button"
                onClick={() => { setSeverityOpen((o) => !o); setFeedOpen(false); }}
                aria-expanded={severityOpen}
                className="flex w-full min-w-0 items-center gap-2 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-white/5"
              >
                <Gauge className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Severity
                </span>
                <ChevronDown
                  className={cn(
                    "ml-auto h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200",
                    severityOpen && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>
              {severityOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 rounded-2xl border border-white/10 bg-black/40 p-1 shadow-lg backdrop-blur-md">
                  <div role="toolbar" aria-label="Heatmap intensity filter" className="flex gap-0.5">
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
                            "min-h-[32px] min-w-[2.75rem] flex-1 rounded-xl px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide transition-[color,background-color,box-shadow,transform] duration-200 ease-out",
                            active
                              ? "bg-radiant-red text-white shadow-md shadow-red-500/30"
                              : "text-neutral-400 hover:bg-white/8 hover:text-neutral-100 active:scale-[0.98]"
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Feed filter — only shown on Official Incidents tab */}
            {activeIncidentTab === "official" && (
              <div className="relative rounded-2xl border border-white/10 bg-black/40 shadow-lg backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => { setFeedOpen((o) => !o); setSeverityOpen(false); }}
                  aria-expanded={feedOpen}
                  className="flex w-full min-w-0 items-center gap-2 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-white/5"
                >
                  <Signal className="h-3.5 w-3.5 shrink-0 text-sky-500/70" aria-hidden />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {dataSourceFilter === "historical" ? "2025" : dataSourceFilter === "live" ? "Live" : "Feed"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "ml-auto h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200",
                      feedOpen && "rotate-180"
                    )}
                    aria-hidden
                  />
                </button>
                {feedOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 rounded-2xl border border-white/10 bg-black/40 p-1 shadow-lg backdrop-blur-md">
                    <div role="toolbar" aria-label="Data source filter" className="flex gap-0.5">
                      {DATA_SOURCE_SEGMENTS.map(({ id, label, title }) => {
                        const active = dataSourceFilter === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            title={title}
                            aria-pressed={active}
                            onClick={() => onDataSourceFilterChange(id)}
                            className={cn(
                              "min-h-[32px] min-w-[2.75rem] flex-1 rounded-xl px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide transition-[color,background-color,box-shadow,transform] duration-200 ease-out",
                              active
                                ? "bg-sky-600 text-white shadow-md shadow-sky-500/30"
                                : "text-neutral-400 hover:bg-white/8 hover:text-neutral-100 active:scale-[0.98]"
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );

  return navPortaled ? createPortal(nav, document.body) : nav;
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
      className="pointer-events-auto fixed inset-0 z-[10100] flex items-center justify-center p-4"
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
        width: 173,
      }}
      className="z-[10050] rounded-xl border border-radiant-border bg-radiant-surface/98 p-1.5 shadow-2xl backdrop-blur-xl"
    >
      <div className="space-y-1.5 px-3 py-2">
        <p className="truncate text-xs font-medium text-gray-100">{user.name}</p>
        <div className="flex flex-col gap-1">
          {isResponder ? (
            <span className="inline-flex w-fit rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-400">
              Verified Responder
            </span>
          ) : (
            <span className="inline-flex w-fit rounded-full bg-gray-600/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-300">
              Standard User
            </span>
          )}
          {user.over18Verified && (
            <span className="inline-flex w-fit rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
              18+ verified
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
          "flex items-center gap-1 rounded-full border border-radiant-border p-1 transition-colors hover:border-gray-500",
          open && "border-gray-500"
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-radiant-red/15 text-radiant-red">
          <UserCircle className="h-5 w-5" strokeWidth={1.75} />
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
