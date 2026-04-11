"use client";

import Link from "next/link";
import {
  Shield,
  AlertCircle,
  LogIn,
  UserPlus,
  LogOut,
  ChevronDown,
  Bot,
  UserCircle,
  ClipboardList,
  Settings,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/cn";
import type { UserReputation, UserReport } from "@/lib/types";
import { userReports } from "@/lib/mock-data";
import type { AuthUser } from "@/lib/auth-storage";
import SearchBar from "./SearchBar";

export type { AuthUser };

export type DashboardTab = "pulse" | "news";

interface TopNavProps {
  reputation: UserReputation;
  user: AuthUser | null;
  reports: UserReport[];
  onSearchSelectIncident: (report: UserReport) => void;
  onSearchSelectArea: (coords: { latitude: number; longitude: number; zoom: number }) => void;
  onLogout: () => void;
  onViewPastReports: () => void;
  onChatToggle: () => void;
  isChatOpen: boolean;
}

export default function TopNav({
  reputation,
  user,
  reports,
  onSearchSelectIncident,
  onSearchSelectArea,
  onLogout,
  onViewPastReports,
  onChatToggle,
  isChatOpen,
}: TopNavProps) {
  const activeAlerts = userReports.length;

  return (
    <nav className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex items-center gap-4 px-5 py-3 bg-gradient-to-b from-black/80 via-black/50 to-transparent">
      {/* Left: Branding + Reputation */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-gray-400" />
          <span className="text-xs font-medium uppercase tracking-widest text-gray-400">
            The Pulse
          </span>
        </div>

      </div>

      {/* Center: Search */}
      <div className="flex flex-1 justify-center">
        <SearchBar
          reports={reports}
          onSelectIncident={onSearchSelectIncident}
          onSelectArea={onSearchSelectArea}
        />
      </div>

      {/* Right: Location, Alerts, Auth */}
      <div className="flex shrink-0 items-center gap-4">
        <span className="hidden text-xs font-medium uppercase tracking-widest text-gray-400 lg:block">
          Melbourne
        </span>
        <div className="flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-radiant-red animate-pulse" />
          <span className="text-sm font-semibold text-radiant-red">
            {activeAlerts}
          </span>
        </div>

        <button
          onClick={onChatToggle}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
            isChatOpen
              ? "border-radiant-red/50 bg-radiant-red/10 text-radiant-red"
              : "border-radiant-border text-gray-400 hover:border-gray-500 hover:text-gray-200"
          )}
          aria-label="Toggle Safety AI"
        >
          <Bot className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Safety AI</span>
        </button>

        <div className="h-5 w-px bg-gray-700" />

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
          className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-radiant-border bg-radiant-surface/95 p-1.5 shadow-2xl backdrop-blur-xl"
        >
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-gray-200">{user.name}</p>
            <p className="truncate text-[11px] text-gray-500">{user.email}</p>
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
              onLogout();
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
