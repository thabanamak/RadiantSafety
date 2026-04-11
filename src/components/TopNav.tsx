"use client";

import { LogIn, UserPlus, LogOut, ChevronDown, ShieldAlert, Users } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/cn";
import type { UserReputation } from "@/lib/types";
import SearchBar from "./SearchBar";

export interface AuthUser {
  /** Stable id (normalized email) for linking reports */
  id: string;
  name: string;
  email: string;
  /** Must be true to submit incident quick reports (18+ verified signup). */
  over18Verified: boolean;
}

export type DashboardTab = "news";
export type IncidentTab = "official" | "user-reported";

interface TopNavProps {
  reputation: UserReputation;
  user: AuthUser | null;
  mapCenter?: { latitude: number; longitude: number } | null;
  activeIncidentTab: IncidentTab;
  onIncidentTabChange: (tab: IncidentTab) => void;
  onSearchSelectArea: (coords: { latitude: number; longitude: number; zoom: number }) => void;
  onLoginClick: () => void;
  onSignupClick: () => void;
  /** One-click demo admin (18+ verified) for testing reports */
  onDemoLogin?: () => void;
  onLogout: () => void;
}

export default function TopNav({
  reputation,
  user,
  mapCenter,
  activeIncidentTab,
  onIncidentTabChange,
  onSearchSelectArea,
  onLoginClick,
  onSignupClick,
  onDemoLogin,
  onLogout,
}: TopNavProps) {
  return (
    <nav className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex flex-col bg-gradient-to-b from-black/85 via-black/60 to-transparent pb-4">
      {/* Row 1: Branding + Right controls */}
      <div className="flex items-center gap-4 px-5 py-3">
        {/* Left: Branding + Reputation */}
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

        {/* Right: Auth */}
        <div className="flex shrink-0 items-center gap-4">
          {user ? (
            <AccountDropdown
              user={user}
              onLogout={onLogout}
            />
          ) : (
            <div className="flex items-center gap-2">
              {onDemoLogin && (
                <button
                  type="button"
                  onClick={onDemoLogin}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:border-amber-400/60 hover:bg-amber-500/20"
                >
                  Demo login
                </button>
              )}
              <button
                onClick={onLoginClick}
                className="flex items-center gap-1.5 rounded-lg border border-radiant-border px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
              >
                <LogIn className="h-3.5 w-3.5" />
                Log In
              </button>
              <button
                onClick={onSignupClick}
                className="flex items-center gap-1.5 rounded-lg bg-radiant-red px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-red-500/20 transition-all hover:shadow-red-500/40"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Sign Up
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Big centered search */}
      <div className="flex flex-col items-center gap-3 px-5">
        <SearchBar
          mapCenter={mapCenter}
          onSelectArea={onSearchSelectArea}
        />

        {/* Incident tab pills */}
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-1 backdrop-blur-md shadow-lg">
          <button
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
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
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

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 rounded-lg border border-radiant-border px-2.5 py-1.5 transition-colors hover:border-gray-500"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-radiant-red/20 text-[10px] font-bold text-radiant-red">
          {initials}
        </div>
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
            "h-3 w-3 text-gray-500 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-radiant-border bg-radiant-surface/95 p-1.5 shadow-2xl backdrop-blur-xl">
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-gray-200">{user.name}</p>
            <p className="text-[11px] text-gray-500">{user.email}</p>
            {user.over18Verified && (
              <p className="mt-1.5 text-[10px] font-medium text-emerald-400/90">
                ✓ Eligible to file incident reports
              </p>
            )}
          </div>
          <div className="my-1 h-px bg-radiant-border" />
          <button
            onClick={() => { onLogout(); setOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-gray-400 transition-colors hover:bg-radiant-card hover:text-gray-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
