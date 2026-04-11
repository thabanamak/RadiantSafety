"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronUp,
  Zap,
  MapPin,
  ThumbsUp,
  ThumbsDown,
  CheckCircle,
  Clock,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { UserReport } from "@/lib/types";
import { getTrustDisplayKind } from "@/lib/report-trust";

interface IncidentFeedProps {
  reports: UserReport[];
  onViewMap: (report: UserReport) => void;
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

function timeAgo(date: Date, nowMs: number): string {
  const seconds = Math.floor((nowMs - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type SheetState = "collapsed" | "half" | "full";

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
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-lg font-bold text-gray-100">{sheetTitle}</h2>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Zap className="h-3 w-3 text-radiant-green" />
            Community
          </div>
        </div>
      )}

      {/* ── Feed list ─────────────────────────────────────────── */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No reports yet. Submit one with the quick-report button (bottom-right).
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {sorted.map((report) => (
                <IncidentCard
                  key={report.id}
                  report={report}
                  onViewMap={() => onViewMap(report)}
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

function IncidentCard({
  report,
  onViewMap,
  nowMs,
}: {
  report: UserReport;
  onViewMap: () => void;
  nowMs: number | null;
}) {
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

      <div className="rounded-xl border border-radiant-border bg-radiant-card p-4 transition-colors hover:border-gray-600">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-gray-100">{report.category}</h3>
          {report.imageDataUrl ? (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setEnlargedSrc(report.imageDataUrl!)}
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
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(() => {
              const kind = getTrustDisplayKind(report.trustPoints);
              if (kind === "trustworthy") {
                return (
                  <>
                    <CheckCircle className="h-3 w-3 shrink-0 text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-300">
                      Trustworthy
                    </span>
                  </>
                );
              }
              if (kind === "semi_trustworthy") {
                return (
                  <>
                    <CheckCircle className="h-3 w-3 shrink-0 text-sky-400" />
                    <span className="text-xs font-medium text-sky-200">
                      Semi-trustworthy
                    </span>
                  </>
                );
              }
              if (kind === "medium_trust") {
                return (
                  <>
                    <Clock className="h-3 w-3 shrink-0 text-amber-400/90" />
                    <span className="text-xs font-medium text-amber-300/90">
                      Medium trust
                    </span>
                  </>
                );
              }
              return (
                <>
                  <Clock className="h-3 w-3 shrink-0 text-red-400/90" />
                  <span className="text-xs font-medium text-red-300/90">
                    Untrustworthy
                  </span>
                </>
              );
            })()}
            {report.verifiedBy > 0 && (
              <span className="text-[10px] text-gray-500">
                · {report.verifiedBy} confirmations
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-xs text-gray-500">
          {nowMs == null ? "" : timeAgo(report.createdAt, nowMs)}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <VoteButton icon={ThumbsUp}   count={report.upvotes} />
          <VoteButton icon={ThumbsDown} count={report.downvotes} />
        </div>
        <button
          onClick={onViewMap}
          className="flex items-center gap-1.5 rounded-lg border border-radiant-border bg-radiant-dark px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
        >
          <MapPin className="h-3 w-3" />
          View Map
        </button>
      </div>
    </div>
    </>
  );
}

function VoteButton({ icon: Icon, count }: { icon: typeof ThumbsUp; count: number }) {
  return (
    <button className="flex items-center gap-1.5 rounded-lg border border-radiant-border px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200">
      <Icon className="h-3 w-3" />
      {count}
    </button>
  );
}
