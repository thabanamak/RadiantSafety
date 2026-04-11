"use client";

import { useState, useEffect, useCallback } from "react";
import { X, MapPin, FileText, Trash2, ThumbsUp, ThumbsDown } from "lucide-react";
import type { UserReport } from "@/lib/types";
import { cn } from "@/lib/cn";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchPublicProfile, voteProfile, type PublicProfileRow } from "@/lib/supabase-profiles";
import { getTrustDisplayText } from "@/lib/report-trust";

interface ReporterProfileModalProps {
  open: boolean;
  onClose: () => void;
  reporterId: string;
  reporterDisplayName: string;
  reports: UserReport[];
  onViewMap: (report: UserReport) => void;
  currentUserId?: string | null;
  onDeleteReport?: (reportId: string) => void;
}

export default function ReporterProfileModal({
  open,
  onClose,
  reporterId,
  reporterDisplayName,
  reports,
  onViewMap,
  currentUserId,
  onDeleteReport,
}: ReporterProfileModalProps) {
  const [profile, setProfile] = useState<PublicProfileRow | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!reporterId.trim()) return;
    setProfileLoadError(null);
    const { client } = getSupabaseBrowserClient();
    if (!client) {
      setProfileLoadError("Supabase not configured");
      return;
    }
    const row = await fetchPublicProfile(client, reporterId);
    setProfile(row);
    if (!row) {
      setProfileLoadError("No profile row yet for this user.");
    }
  }, [reporterId]);

  useEffect(() => {
    if (!open || !reporterId.trim()) return;
    void loadProfile();
  }, [open, reporterId, loadProfile]);

  useEffect(() => {
    if (!open || !reporterId.trim()) return;
    const { client } = getSupabaseBrowserClient();
    if (!client) return;

    const channel = client
      .channel(`profiles:${reporterId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${reporterId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row || typeof row.id !== "string") return;
          const upvotes = row.upvotes;
          const downvotes = row.downvotes;
          const reputation = row.reputation;
          const username = row.username;
          if (
            typeof upvotes !== "number" ||
            typeof downvotes !== "number" ||
            typeof reputation !== "number" ||
            typeof username !== "string"
          ) {
            return;
          }
          setProfile({
            id: row.id,
            username,
            upvotes,
            downvotes,
            reputation,
          });
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [open, reporterId]);

  const handleProfileVote = async (direction: "up" | "down") => {
    if (!currentUserId || !reporterId.trim() || profileBusy) return;
    const { client } = getSupabaseBrowserClient();
    if (!client) return;
    setProfileBusy(true);
    try {
      const result = await voteProfile(client, reporterId, direction);
      if (!result.ok) {
        console.warn("[RadiantSafety] vote_profile:", result.error);
        return;
      }
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              upvotes: result.upvotes,
              downvotes: result.downvotes,
              reputation: result.reputation,
            }
          : {
              id: reporterId,
              username: reporterDisplayName,
              upvotes: result.upvotes,
              downvotes: result.downvotes,
              reputation: result.reputation,
            }
      );
    } finally {
      setProfileBusy(false);
    }
  };

  const canVoteProfile =
    Boolean(currentUserId) &&
    Boolean(profile) &&
    reporterId.trim().toLowerCase() !== (currentUserId ?? "").trim().toLowerCase();

  if (!open) return null;

  const sorted = [...reports].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  function reportOwnerId(r: UserReport): string {
    return r.reporterId || r.userId;
  }

  function canDeleteReport(r: UserReport): boolean {
    if (!currentUserId || !onDeleteReport) return false;
    return (
      reportOwnerId(r).trim().toLowerCase() === currentUserId.trim().toLowerCase()
    );
  }

  const handleDelete = (r: UserReport) => {
    if (!canDeleteReport(r) || !onDeleteReport) return;
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    onDeleteReport(r.id);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reporter-profile-title"
        className="relative z-10 flex max-h-[min(85vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-radiant-border bg-radiant-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-radiant-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="reporter-profile-title" className="text-lg font-bold text-gray-100">
              {reporterDisplayName}
            </h2>
            <p className="mt-1 text-[11px] text-gray-500">
              Verified 18+ reporter · {sorted.length} incident{sorted.length === 1 ? "" : "s"} filed
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-gray-600" title={reporterId}>
              ID: {reporterId}
            </p>

            <div className="mt-3 rounded-lg border border-radiant-border bg-radiant-card/90 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Reputation
              </p>
              {profile ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-2xl font-bold tabular-nums text-gray-100">
                    {profile.reputation}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    ({profile.upvotes}↑ · {profile.downvotes}↓)
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-xs text-gray-500">
                  {profileLoadError ?? "Loading…"}
                </p>
              )}
              {canVoteProfile ? (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={profileBusy}
                    onClick={() => void handleProfileVote("up")}
                    className="inline-flex items-center gap-1 rounded-md border border-radiant-border px-2 py-1 text-[11px] text-gray-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-200 disabled:opacity-50"
                  >
                    <ThumbsUp className="h-3 w-3" />
                    Upvote profile
                  </button>
                  <button
                    type="button"
                    disabled={profileBusy}
                    onClick={() => void handleProfileVote("down")}
                    className="inline-flex items-center gap-1 rounded-md border border-radiant-border px-2 py-1 text-[11px] text-gray-300 transition-colors hover:border-red-500/40 hover:text-red-200 disabled:opacity-50"
                  >
                    <ThumbsDown className="h-3 w-3" />
                    Downvote profile
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-[10px] text-gray-600">
                  {!currentUserId
                    ? "Sign in to vote on this profile."
                    : reporterId.trim().toLowerCase() ===
                      (currentUserId ?? "").trim().toLowerCase()
                      ? "You can’t vote on your own profile."
                      : "Create a profile (sign up flow) before others can vote on it."}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-radiant-card hover:text-gray-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No reports from this user in this session.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sorted.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-radiant-border bg-radiant-card p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-radiant-red">{r.category}</p>
                      <div className="mt-1.5 rounded-md border border-radiant-border/70 bg-radiant-dark/50 px-2 py-1">
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                          Trustworthiness
                        </p>
                        <p className="text-[10px] tabular-nums text-gray-500">
                          Score{" "}
                          <span className="font-semibold text-gray-300">{r.trustPoints}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] font-semibold text-gray-100">
                          {r.trustLabel?.trim() || getTrustDisplayText(r.trustPoints)}
                        </p>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-gray-400">
                        {r.description}
                      </p>
                      <p className="mt-1 text-[10px] text-gray-600">
                        {r.createdAt.toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      {canDeleteReport(r) && (
                        <button
                          type="button"
                          onClick={() => handleDelete(r)}
                          className="flex items-center justify-center gap-1 rounded-lg border border-red-500/35 bg-red-500/10 px-2 py-1.5 text-[10px] font-medium text-red-300 hover:border-red-400/50 hover:bg-red-500/20"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          onViewMap(r);
                          onClose();
                        }}
                        className={cn(
                          "flex items-center justify-center gap-1 rounded-lg border border-radiant-border px-2 py-1.5",
                          "text-[10px] font-medium text-gray-400 transition-colors hover:border-gray-500 hover:text-white"
                        )}
                      >
                        <MapPin className="h-3 w-3" />
                        Map
                      </button>
                    </div>
                  </div>
                  {r.imageDataUrl && (
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-600">
                      <FileText className="h-3 w-3" />
                      Includes photo
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
