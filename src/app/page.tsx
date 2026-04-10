"use client";

import { useState, useCallback } from "react";
import RadiantMap from "@/components/RadiantMap";
import TopNav from "@/components/TopNav";
import type { AuthUser, DashboardTab } from "@/components/TopNav";
import IncidentFeed from "@/components/IncidentFeed";
import QuickReportFAB from "@/components/QuickReportFAB";
import AuthModal from "@/components/AuthModal";
import SafetyChatbot from "@/components/SafetyChatbot";
import { currentUser, userReports } from "@/lib/mock-data";
import type { MapIncidentPoint, UserReport } from "@/lib/types";
import NewsIncidentFeed, { type NewsIncidentItem } from "@/components/NewsIncidentFeed";
import NewsSidebar from "@/components/NewsSidebar";

type ModalState = "closed" | "login" | "signup";

export default function Dashboard() {
  const [flyTarget, setFlyTarget] = useState<{
    latitude: number;
    longitude: number;
    zoom?: number;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<DashboardTab>("pulse");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [modalState, setModalState] = useState<ModalState>("closed");
  const [isChatOpen, setIsChatOpen] = useState(false);

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

  const handleAuth = useCallback((user: AuthUser) => {
    setAuthUser(user);
  }, []);

  const handleLogout = useCallback(() => {
    setAuthUser(null);
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
        <TopNav
          reputation={currentUser}
          user={authUser}
          reports={activeTab === "news" ? [] : userReports}
          onSearchSelectIncident={handleViewMap}
          onSearchSelectArea={handleSelectArea}
          onLoginClick={() => setModalState("login")}
          onSignupClick={() => setModalState("signup")}
          onLogout={handleLogout}
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
          <IncidentFeed reports={userReports} onViewMap={handleViewMap} />
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

      <AuthModal
        isOpen={modalState !== "closed"}
        onClose={() => setModalState("closed")}
        onAuth={handleAuth}
      />
    </main>
  );
}
