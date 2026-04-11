"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronUp,
  Zap,
  ThumbsUp,
  ThumbsDown,
  CheckCircle,
  Clock,
  X,
  User,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { UserReport } from "@/lib/types";
import { getTrustDisplayKind, getTrustDisplayText } from "@/lib/report-trust";
import {
  formatReportExactTimestamp,
  formatReportRelativeAge,
} from "@/lib/relative-time";

interface IncidentFeedProps {
  reports: UserReport[];
  onViewMap: (report: UserReport) => void;
  /** Click reporter to open profile (stats + list). */
  onOpenReporterProfile?: (reporterId: string, displayName: string) => void;
  /** Signed-in user id (normalized); used to allow deleting only your own reports. */
  currentUserId?: string | null;
  onDeleteReport?: (reportId: string) => void;
  /** When signed in: filter to only your reports (past reports you filed). */
  onlyMine?: boolean;
  onOnlyMineChange?: (onlyMine: boolean) => void;
  /** Total rows before `onlyMine` filter — for empty-state copy. */
  totalBeforeMineFilter?: number;
  /** Signed-in users only: toggle vote via Supabase (`toggle_user_report_vote` RPC). */
  onVoteReport?: (reportId: string, direction: "up" | "down") => Promise<void>;
  /** Collapsed bar label (default: Incident Feed) */
  collapsedLabel?: string;
  /** Header when sheet is open */
  sheetTitle?: string;
  /**
   * Pixels to keep clear at the top of the viewport (nav + search + tab pills).
   * Caps how far the sheet can expand so the drag handle stays below that chrome.
   */
  reserveTopPx?: number;
}

type SheetState = "collapsed" | "half" | "full";

/** Standalone trust line — uses DB `trust` / `trust_label` when provided (realtime + fetch). */
function TrustworthinessRow({
  trustPoints,
  trustLabel,
  verifiedBy,
}: {
  trustPoints: number;
  trustLabel?: string | null;
  verifiedBy: number;
}) {
  const kind = getTrustDisplayKind(trustPoints);
  const label = trustLabel?.trim() || getTrustDisplayText(trustPoints);
  return (
    <div className="mt-2 space-y-1">
      <div
        className={cn(
          "rounded-md border px-2.5 py-1.5",
          kind === "trustworthy" && "border-emerald-500/35 bg-emerald-950/30",
          kind === "semi_trustworthy" && "border-sky-500/35 bg-sky-950/25",
          kind === "medium_trust" && "border-amber-500/30 bg-amber-950/20",
          kind === "untrustworthy" && "border-red-500/30 bg-red-950/25"
        )}
      >
        <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">
          Trustworthiness
        </p>
        <p className="mt-0.5 text-[10px] tabular-nums text-gray-500">
          Score <span className="font-semibold text-gray-300">{trustPoints}</span>
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {kind === "trustworthy" && (
            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
          )}
          {kind === "semi_trustworthy" && (
            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden />
          )}
          {kind === "medium_trust" && (
            <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400/90" aria-hidden />
          )}
          {kind === "untrustworthy" && (
            <Clock className="h-3.5 w-3.5 shrink-0 text-red-400/90" aria-hidden />
          )}
          <span
            className={cn(
              "text-xs font-semibold",
              kind === "trustworthy" && "text-emerald-300",
              kind === "semi_trustworthy" && "text-sky-200",
              kind === "medium_trust" && "text-amber-300/95",
              kind === "untrustworthy" && "text-red-300/95"
            )}
          >
            {label}
          </span>
        </div>
      </div>
      {verifiedBy > 0 && (
        <p className="text-[10px] text-gray-500">
          {verifiedBy} community confirmation{verifiedBy === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

const COLLAPSED_H = 52;

function snapHeights(reserveTopPx: number) {
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const maxSheet = Math.max(COLLAPSED_H + 80, vh - reserveTopPx);
  return {
    collapsed: COLLAPSED_H,
    half: Math.min(Math.round(vh * 0.45), maxSheet),
    full: Math.min(Math.round(vh * 0.85), maxSheet),
  };
}

function closestSnap(h: number, reserveTopPx: number): SheetState {
  const heights = snapHeights(reserveTopPx);
  const options: Array<{ state: SheetState; h: number }> = [
    { state: "collapsed", h: heights.collapsed },
    { state: "half",      h: heights.half },
    { state: "full",      h: heights.full },
  ];
  return options.reduce((best, c) =>
    Math.abs(c.h - h) < Math.abs(best.h - h) ? c : best
  ).state;
}

export default function IncidentFeed({
  reports,
  onViewMap,
  onOpenReporterProfile,
  currentUserId,
  onDeleteReport,
  onlyMine = false,
  onOnlyMineChange,
  totalBeforeMineFilter = 0,
  onVoteReport,
  collapsedLabel = "Incident Feed",
  sheetTitle = "Incident Feed",
  reserveTopPx = 0,
}: IncidentFeedProps) {
  const [sheetState, setSheetState] = useState<SheetState>("collapsed");
  const [nowMs, setNowMs]           = useState<number | null>(null);
  const [heightPx, setHeightPxRaw]  = useState<number>(COLLAPSED_H);

  // Live ref — avoids stale closures in pointer handlers
  const heightRef = useRef(COLLAPSED_H);
  const setHeightPx = useCallback((h: number) => {
    heightRef.current = h;
    setHeightPxRaw(h);
  }, []);

  const dragStart = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);

  // Keep pixel height in sync with snap state, top reserve, & window resize
  useEffect(() => {
    const sync = () => setHeightPx(snapHeights(reserveTopPx)[sheetState]);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [sheetState, setHeightPx, reserveTopPx]);

  // Tick relative times
  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // One-click toggle: collapsed ↔ half
  const toggle = useCallback(() => {
    setSheetState((prev) => (prev === "collapsed" ? "half" : "collapsed"));
  }, []);

  const sorted = [...reports].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  const isOpen = sheetState !== "collapsed";

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-radiant-surface/95 backdrop-blur-xl border-t border-radiant-border transition-[height] duration-250 ease-out"
      style={{ height: heightPx }}
    >
      {/* ── Handle / toggle button ────────────────────────────── */}
      <button
        aria-label={isOpen ? "Collapse incident feed" : "Open incident feed"}
        className={cn(
          "group relative flex w-full items-center justify-center touch-none select-none",
          isOpen
            ? "cursor-grab active:cursor-grabbing px-5 pt-3 pb-2 flex-col gap-1.5"
            : "cursor-pointer px-5 py-3"
        )}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          dragStart.current = { startY: e.clientY, startHeight: heightRef.current, moved: false };
        }}
        onPointerMove={(e) => {
          if (!dragStart.current) return;
          const delta = dragStart.current.startY - e.clientY;
          if (Math.abs(delta) > 4) dragStart.current.moved = true;
          if (!dragStart.current.moved) return;
          const heights = snapHeights(reserveTopPx);
          const next = Math.max(heights.collapsed, Math.min(heights.full, dragStart.current.startHeight + delta));
          setHeightPx(next);
        }}
        onPointerUp={() => {
          if (!dragStart.current) return;
          const wasDrag = dragStart.current.moved;
          dragStart.current = null;
          if (wasDrag) {
            // Snap to nearest after drag
            setSheetState(closestSnap(heightRef.current, reserveTopPx));
          } else {
            // Plain tap — toggle open/close
            toggle();
          }
        }}
        onPointerCancel={() => { dragStart.current = null; }}
        onClick={(e) => e.stopPropagation()}
      >
        {isOpen ? (
          /* Open state: thin pill + "drag to resize" affordance */
          <>
            <div className="h-1 w-10 rounded-full bg-gray-600 group-hover:bg-gray-400 transition-colors" />
            <div className="flex items-center gap-1.5 text-[11px] text-gray-600 group-hover:text-gray-400 transition-colors">
              <ChevronDown className="h-3 w-3" />
              <span>drag or tap to close</span>
            </div>
          </>
        ) : (
          /* Collapsed state: prominent labelled pill */
          <div className="flex items-center gap-2 rounded-xl bg-radiant-card border border-radiant-border px-5 py-2 shadow-lg shadow-black/40 group-hover:border-gray-500 transition-colors">
            <Zap className="h-3.5 w-3.5 text-radiant-green" />
            <span className="text-sm font-semibold text-gray-100">{collapsedLabel}</span>
            <ChevronUp className="h-4 w-4 text-gray-400 group-hover:text-gray-200 transition-colors" />
          </div>
        )}
      </button>

      {/* ── Header (only when open) ───────────────────────────── */}
      {isOpen && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3">
          <h2 className="text-lg font-bold text-gray-100">{sheetTitle}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {currentUserId && onOnlyMineChange && (
              <div
                className="flex items-center rounded-lg border border-radiant-border bg-radiant-card/80 p-0.5"
                role="group"
                aria-label="Report scope"
              >
                <button
                  type="button"
                  onClick={() => onOnlyMineChange(false)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    !onlyMine
                      ? "bg-radiant-red/90 text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-200"
                  )}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => onOnlyMineChange(true)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    onlyMine
                      ? "bg-radiant-red/90 text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-200"
                  )}
                >
                  Mine
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Zap className="h-3 w-3 text-radiant-green" />
              Community
            </div>
          </div>
        </div>
      )}

      {/* ── Feed list ─────────────────────────────────────────── */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              {onlyMine && totalBeforeMineFilter > 0
                ? "You don’t have any reports yet. Use the quick-report button (bottom-right) to file one."
                : "No reports yet. Sign up as an 18+ user and use the quick-report button (bottom-right)."}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {sorted.map((report) => (
                <IncidentCard
                  key={report.id}
                  report={report}
                  onViewMap={() => onViewMap(report)}
                  onOpenReporterProfile={onOpenReporterProfile}
                  currentUserId={currentUserId}
                  onDeleteReport={onDeleteReport}
                  onVoteReport={onVoteReport}
                  nowMs={nowMs}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function reporterKey(report: UserReport): string {
  return report.reporterId || report.userId;
}

function reporterName(report: UserReport): string {
  return report.reporterDisplayName || report.reporterId || report.userId || "Unknown";
}

function isReportOwnedBy(report: UserReport, currentUserId: string | null | undefined): boolean {
  if (!currentUserId) return false;
  const rid = reporterKey(report);
  return rid.trim().toLowerCase() === currentUserId.trim().toLowerCase();
}

function IncidentCard({
  report,
  onViewMap,
  onOpenReporterProfile,
  currentUserId,
  onDeleteReport,
  onVoteReport,
  nowMs,
}: {
  report: UserReport;
  onViewMap: () => void;
  onOpenReporterProfile?: (reporterId: string, displayName: string) => void;
  currentUserId?: string | null;
  onDeleteReport?: (reportId: string) => void;
  onVoteReport?: (reportId: string, direction: "up" | "down") => Promise<void>;
  nowMs: number | null;
}) {
  const canDelete =
    Boolean(onDeleteReport) && isReportOwnedBy(report, currentUserId);
  const isOwnReport = isReportOwnedBy(report, currentUserId);
  const canVote = Boolean(
    onVoteReport && currentUserId && !isOwnReport
  );
  const [voteBusy, setVoteBusy] = useState(false);

  const voteTitleHint =
    !currentUserId
      ? "Sign in to vote"
      : isOwnReport
        ? "You can’t vote on your own report"
        : undefined;

  const handleVote = async (direction: "up" | "down") => {
    if (!onVoteReport || !canVote || voteBusy) return;
    setVoteBusy(true);
    try {
      await onVoteReport(report.id, direction);
    } finally {
      setVoteBusy(false);
    }
  };

  const handleDelete = () => {
    if (!canDelete || !onDeleteReport) return;
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    onDeleteReport(report.id);
  };
  const [enlargedSrc, setEnlargedSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!enlargedSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEnlargedSrc(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [enlargedSrc]);

  return (
    <>
      {enlargedSrc && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/88 p-4 pt-14 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Full size photo"
          onClick={() => setEnlargedSrc(null)}
        >
          <button
            type="button"
            className="absolute right-3 top-3 z-[201] rounded-xl border border-white/20 bg-black/50 p-2.5 text-white transition-colors hover:bg-white/15"
            aria-label="Close photo"
            onClick={(e) => {
              e.stopPropagation();
              setEnlargedSrc(null);
            }}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enlargedSrc}
            alt="Incident photo"
            className="max-h-[min(90vh,100%)] max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={onViewMap}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onViewMap(); }}
        className="cursor-pointer rounded-xl border border-radiant-border bg-radiant-card p-4 transition-colors hover:border-gray-600"
      >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-gray-100">{report.category}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-600">Reported by</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenReporterProfile?.(reporterKey(report), reporterName(report));
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border border-radiant-border bg-radiant-dark/80 px-2 py-0.5 text-[11px] font-medium text-sky-300 transition-colors",
                onOpenReporterProfile && "hover:border-sky-500/50 hover:text-sky-200",
                !onOpenReporterProfile && "cursor-default opacity-80"
              )}
            >
              <User className="h-3 w-3 shrink-0" />
              {reporterName(report)}
            </button>
          </div>
          {report.imageDataUrl ? (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setEnlargedSrc(report.imageDataUrl!); }}
                className="group relative shrink-0 rounded-md border border-radiant-border focus:outline-none focus-visible:ring-2 focus-visible:ring-radiant-red/60"
                aria-label="View full size photo"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={report.imageDataUrl}
                  alt=""
                  className="h-16 w-16 rounded-md object-cover transition-opacity group-hover:opacity-90"
                />
              </button>
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-gray-300">
                {report.description}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-gray-300">{report.description}</p>
          )}
          <TrustworthinessRow
            trustPoints={report.trustPoints}
            trustLabel={report.trustLabel}
            verifiedBy={report.verifiedBy}
          />
        </div>
        <div className="shrink-0 text-right text-sm text-gray-500">
          {nowMs == null ? null : (
            <>
              <div>{formatReportRelativeAge(report.createdAt, nowMs)}</div>
              <div className="mt-0.5 text-xs tabular-nums text-gray-600">
                {formatReportExactTimestamp(report.createdAt)}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <VoteButton
            icon={ThumbsUp}
            label="Upvote"
            disabled={!canVote}
            busy={voteBusy}
            titleHint={voteTitleHint}
            active={report.myVote === "up"}
            isUp
            onClick={() => void handleVote("up")}
          />
          <VoteButton
            icon={ThumbsDown}
            label="Downvote"
            disabled={!canVote}
            busy={voteBusy}
            titleHint={voteTitleHint}
            active={report.myVote === "down"}
            isUp={false}
            onClick={() => void handleVote("down")}
          />
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:border-red-400/50 hover:bg-red-500/20"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

function VoteButton({
  icon: Icon,
  label,
  disabled,
  busy,
  titleHint,
  active,
  isUp,
  onClick,
}: {
  icon: typeof ThumbsUp;
  label: string;
  disabled: boolean;
  busy: boolean;
  /** When set and the button is disabled, shown as tooltip instead of “Sign in”. */
  titleHint?: string;
  active: boolean;
  isUp: boolean;
  onClick: () => void;
}) {
  const title = busy
    ? label
    : disabled && titleHint
      ? titleHint
      : disabled
        ? "Sign in to vote"
        : label;
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || busy}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors",
        disabled
          ? "cursor-not-allowed border-radiant-border/60 text-gray-600 opacity-70"
          : active && isUp
            ? "border-emerald-500/70 bg-emerald-950/40 text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
            : active && !isUp
              ? "border-red-500/70 bg-red-950/40 text-red-200 shadow-[0_0_0_1px_rgba(248,113,113,0.12)]"
              : "border-radiant-border text-gray-400 hover:border-gray-500 hover:text-gray-200",
        busy && "opacity-70"
      )}
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}
