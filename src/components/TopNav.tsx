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
  ClipboardList,
  Settings,
  Shield,
  Hospital,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/cn";
import type { UserReputation } from "@/lib/types";
import type { AuthUser } from "@/lib/auth-storage";
import SearchBar from "./SearchBar";
import MapVisibilitySwitch from "@/components/MapVisibilitySwitch";

export type { AuthUser };

export type DashboardTab = "news";
export type IncidentTab = "official" | "user-reported";

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
  onViewPastReports: () => void;
  directionsMode?: boolean;
  onDirectionsModeChange?: (active: boolean) => void;
  showPoliceOnMap: boolean;
  onShowPoliceOnMapChange: (next: boolean) => void;
  showHealthFacilitiesOnMap: boolean;
  onShowHealthFacilitiesOnMapChange: (next: boolean) => void;
}

export default function TopNav({
  reputation,
  user,
  mapCenter,
  activeIncidentTab,
  onIncidentTabChange,
  onSearchSelectArea,
  onLogout,
  onViewPastReports,
  directionsMode = false,
  onDirectionsModeChange,
  showPoliceOnMap,
  onShowPoliceOnMapChange,
  showHealthFacilitiesOnMap,
  onShowHealthFacilitiesOnMapChange,
}: TopNavProps) {
  return (
    <nav className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex flex-col bg-gradient-to-b from-black/85 via-black/60 to-transparent pb-4">
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
              onViewPastReports={onViewPastReports}
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
          <SearchBar mapCenter={mapCenter} onSelectArea={onSearchSelectArea} />
          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 sm:gap-x-6">
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

        {onDirectionsModeChange && (
          <button
            type="button"
            onClick={() => onDirectionsModeChange(!directionsMode)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition-all",
              directionsMode
                ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200 shadow-md shadow-cyan-500/20"
                : "border-white/15 bg-black/35 text-gray-300 hover:border-white/25 hover:text-white"
            )}
          >
            <Navigation className="h-3.5 w-3.5" />
            {directionsMode ? "Exit directions planner" : "Directions planner"}
          </button>
        )}

        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-1 backdrop-blur-md shadow-lg">
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
      </div>
    </nav>
  );
}

function AccountDropdown({
  user,
  reputation,
  onLogout,
  onViewPastReports,
}: {
  user: AuthUser;
  reputation: UserReputation;
  onLogout: () => void;
  onViewPastReports: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
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

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[60] mt-2 w-60 rounded-xl border border-radiant-border bg-radiant-surface/95 p-1.5 shadow-2xl backdrop-blur-xl"
        >
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-gray-200">{user.name}</p>
            <p className="truncate text-[11px] text-gray-500">{user.email}</p>
            {user.over18Verified && (
              <p className="mt-1.5 text-[10px] font-medium text-emerald-400/90">
                ✓ Eligible to file incident reports
              </p>
            )}
          </div>

          <div className="mx-2 mb-2 rounded-lg border border-radiant-border bg-radiant-card/80 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Reputation
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-lg font-bold tabular-nums text-gray-100">
                {reputation.score}
              </span>
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
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onViewPastReports();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-radiant-card hover:text-white"
          >
            <ClipboardList className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            View past reports
          </button>

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
      )}
    </div>
  );
}
