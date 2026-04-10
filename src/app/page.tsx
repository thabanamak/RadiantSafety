"use client";

import { useState, useCallback } from "react";
import RadiantMap from "@/components/RadiantMap";
import TopNav from "@/components/TopNav";
import type { AuthUser } from "@/components/TopNav";
import IncidentFeed from "@/components/IncidentFeed";
import QuickReportFAB from "@/components/QuickReportFAB";
import AuthModal from "@/components/AuthModal";
import SafetyChatbot from "@/components/SafetyChatbot";
import { currentUser, userReports } from "@/lib/mock-data";
import type { UserReport } from "@/lib/types";

type ModalState = "closed" | "login" | "signup";

export default function Dashboard() {
  const [flyTarget, setFlyTarget] = useState<{
    latitude: number;
    longitude: number;
    zoom?: number;
  } | null>(null);

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [modalState, setModalState] = useState<ModalState>("closed");
  const [isChatOpen, setIsChatOpen] = useState(false);

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

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0 z-0">
        <RadiantMap onFlyTo={flyTarget} />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        <TopNav
          reputation={currentUser}
          user={authUser}
          reports={userReports}
          onSearchSelectIncident={handleViewMap}
          onSearchSelectArea={handleSelectArea}
          onLoginClick={() => setModalState("login")}
          onSignupClick={() => setModalState("signup")}
          onLogout={handleLogout}
          onChatToggle={() => setIsChatOpen((p) => !p)}
          isChatOpen={isChatOpen}
        />
        <IncidentFeed reports={userReports} onViewMap={handleViewMap} />
      </div>

      <QuickReportFAB />

      <SafetyChatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      <AuthModal
        isOpen={modalState !== "closed"}
        onClose={() => setModalState("closed")}
        onAuth={handleAuth}
      />
    </main>
  );
}
