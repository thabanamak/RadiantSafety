"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isEmailLinkCallback } from "@/lib/auth-callback-url";
import { isEmailConfirmed } from "@/lib/supabase-user";
import { syncProfileFromAuthUser } from "@/lib/supabase/profile-sync";
import { setStoredUser } from "@/lib/auth-storage";
import RadiantMap from "@/components/RadiantMap";
import TopNav from "@/components/TopNav";
import type { DashboardTab } from "@/components/TopNav";
import IncidentFeed from "@/components/IncidentFeed";
import QuickReportFAB from "@/components/QuickReportFAB";
import SafetyChatbot from "@/components/SafetyChatbot";
import type { AuthUser } from "@/lib/auth-storage";
import {
  clearStoredUser,
  DEFAULT_REPUTATION_SCORE,
  getStoredUser,
} from "@/lib/auth-storage";
import type { UserReputation } from "@/lib/types";
import { currentUser as mockCurrentUser, userReports } from "@/lib/mock-data";
import type { MapIncidentPoint, UserReport } from "@/lib/types";
import NewsIncidentFeed, { type NewsIncidentItem } from "@/components/NewsIncidentFeed";
import NewsSidebar from "@/components/NewsSidebar";

function reputationForAuthUser(user: AuthUser): UserReputation {
  const score = user.reputationScore ?? DEFAULT_REPUTATION_SCORE;
  return {
    score,
    label: score >= 70 ? "Trusted" : "Community",
    isTrusted: score >= 70,
  };
}

/** After the user opens the confirmation link, Supabase sends them to `/?welcome=1` — sync storage and UI immediately. */
function EmailConfirmSync({
  onConfirmed,
}: {
  onConfirmed: (user: AuthUser) => void;
}) {
  const router = useRouter();
  const finished = useRef(false);

  useEffect(() => {
    const { client, error } = getSupabaseBrowserClient();
    if (error || !client) return;

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      const user = session?.user;
      if (!user || !isEmailConfirmed(user)) return;
      if (event === "INITIAL_SESSION" && !isEmailLinkCallback()) return;
      if (
        event !== "SIGNED_IN" &&
        !(event === "INITIAL_SESSION" && isEmailLinkCallback())
      ) {
        return;
      }
      if (finished.current) return;
      void (async () => {
        try {
          const authUser = await syncProfileFromAuthUser(client, user);
          if (finished.current) return;
          finished.current = true;
          setStoredUser(authUser);
          onConfirmed(authUser);
          if (
            typeof window !== "undefined" &&
            (isEmailLinkCallback() || window.location.hash)
          ) {
            router.replace("/?welcome=1", { scroll: false });
          }
        } catch (e) {
          console.error(e);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, [onConfirmed, router]);

  return null;
}

function WelcomeBanner({ authUser }: { authUser: AuthUser | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showWelcome = searchParams.get("welcome") === "1";
  const visible = showWelcome && authUser !== null;

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => {
      router.replace("/", { scroll: false });
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [visible, router]);

  if (!visible) return null;

  return (
    <div className="pointer-events-auto absolute left-1/2 top-[72px] z-40 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl border border-emerald-500/35 bg-emerald-950/90 px-4 py-3 shadow-xl backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <p className="flex-1 text-center text-sm leading-relaxed text-emerald-50 sm:text-left">
          <span className="font-semibold text-white">
            Welcome{authUser.name ? `, ${authUser.name}` : ""}!
          </span>{" "}
          You&apos;re signed in — your reputation starts at{" "}
          {authUser.reputationScore ?? DEFAULT_REPUTATION_SCORE}. Explore the Pulse
          and map to get started.
        </p>
        <button
          type="button"
          onClick={() => router.replace("/", { scroll: false })}
          className="shrink-0 rounded-lg p-1 text-emerald-200/80 transition-colors hover:bg-emerald-900/50 hover:text-white"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const pathname = usePathname();
  const router = useRouter();

  const [flyTarget, setFlyTarget] = useState<{
    latitude: number;
    longitude: number;
    zoom?: number;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<DashboardTab>("pulse");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    if (pathname === "/") {
      setAuthUser(getStoredUser());
    }
  }, [pathname]);

  /** Re-sync profile from Supabase so UI never shows another user’s cached name (e.g. old localStorage). */
  useEffect(() => {
    if (pathname !== "/") return;
    let cancelled = false;
    void (async () => {
      const { client, error } = getSupabaseBrowserClient();
      if (error || !client) return;
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session?.user) {
        if (getStoredUser()?.id) {
          clearStoredUser();
          if (!cancelled) setAuthUser(null);
        }
        return;
      }
      const u = await syncProfileFromAuthUser(client, session.user);
      if (cancelled) return;
      setStoredUser(u);
      setAuthUser(u);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const [newsLoaded, setNewsLoaded] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsItems, setNewsItems] = useState<NewsIncidentItem[]>([]);

  const handleViewMap = useCallback((report: UserReport) => {
    setFlyTarget({ latitude: report.latitude, longitude: report.longitude });
  }, []);

  const handleSelectArea = useCallback(
    (coords: { latitude: number; longitude: number; zoom: number }) => {
      setFlyTarget(coords);
    },
    []
  );

  const handleLogout = useCallback(async () => {
    const { client } = getSupabaseBrowserClient();
    if (client) {
      await client.auth.signOut();
    }
    clearStoredUser();
    setAuthUser(null);
    router.replace("/", { scroll: false });
  }, [router]);

  const handleViewPastReports = useCallback(() => {
    setActiveTab("pulse");
    setFlyTarget(null);
    requestAnimationFrame(() => {
      document
        .getElementById("feed-past-reports")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const loadNews = useCallback(async () => {
    if (newsLoading) return;
    setNewsLoaded(true);
    setNewsLoading(true);
    try {
      const res = await fetch("/api/news-incidents", { cache: "no-store" });
      const data = (await res.json()) as { items?: NewsIncidentItem[] };
      setNewsItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setNewsItems([]);
    } finally {
      setNewsLoading(false);
    }
  }, [newsLoading]);

  const newsMapPoints: MapIncidentPoint[] = newsItems
    .filter((i) => i.latitude != null && i.longitude != null)
    .map((i) => ({
      id: i.id,
      latitude: i.latitude as number,
      longitude: i.longitude as number,
      trustScore: 0.55,
      category: "Suspicious Activity",
    }));

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0 z-0">
        <RadiantMap
          onFlyTo={flyTarget}
          reports={activeTab === "news" ? newsMapPoints : userReports}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        <EmailConfirmSync onConfirmed={setAuthUser} />

        <Suspense fallback={null}>
          <WelcomeBanner authUser={authUser} />
        </Suspense>

        <TopNav
          reputation={
            authUser ? reputationForAuthUser(authUser) : mockCurrentUser
          }
          user={authUser}
          reports={activeTab === "news" ? [] : userReports}
          onSearchSelectIncident={handleViewMap}
          onSearchSelectArea={handleSelectArea}
          onLogout={handleLogout}
          onViewPastReports={handleViewPastReports}
          onChatToggle={() => setIsChatOpen((p) => !p)}
          isChatOpen={isChatOpen}
        />

        {/* Floating tab bar — always visible below nav */}
        <div className="pointer-events-auto absolute inset-x-0 top-[58px] z-30 flex justify-center">
          <div className="flex items-center gap-1 rounded-2xl border border-radiant-border bg-radiant-surface/90 p-1 shadow-xl backdrop-blur-xl">
            <button
              onClick={() => { setActiveTab("pulse"); setFlyTarget(null); }}
              className={`rounded-xl px-5 py-2 text-xs font-semibold transition-all ${
                activeTab === "pulse"
                  ? "bg-radiant-red text-white shadow-md shadow-red-500/30"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Pulse
            </button>
            <button
              onClick={() => { setActiveTab("news"); setFlyTarget(null); }}
              className={`rounded-xl px-5 py-2 text-xs font-semibold transition-all ${
                activeTab === "news"
                  ? "bg-radiant-red text-white shadow-md shadow-red-500/30"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              News
            </button>
          </div>
        </div>

        {activeTab === "pulse" && (
          <div id="feed-past-reports" className="pointer-events-auto">
            <IncidentFeed reports={userReports} onViewMap={handleViewMap} />
          </div>
        )}

        {activeTab === "news" && (
          <NewsSidebar />
        )}

        {activeTab === "news" && newsLoaded && (
          <NewsIncidentFeed
            items={newsItems}
            onViewMap={(coords) => setFlyTarget(coords)}
          />
        )}
      </div>

      <QuickReportFAB />

      {activeTab === "news" && !newsLoaded && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-5 pb-6">
          <button
            onClick={loadNews}
            className="pointer-events-auto w-full max-w-md rounded-2xl bg-radiant-red px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/25 transition-all hover:shadow-red-500/40 disabled:opacity-70"
            disabled={newsLoading}
          >
            {newsLoading ? "Loading incidents..." : "Incidents"}
          </button>
        </div>
      )}

      <SafetyChatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </main>
  );
}
