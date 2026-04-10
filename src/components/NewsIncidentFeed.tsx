"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, MapPin, Newspaper, Zap } from "lucide-react";
import { cn } from "@/lib/cn";

export type NewsIncidentItem = {
  id: string;
  outlet?: string | null;
  title: string;
  url: string;
  publishedAt: string | null;
  areaName: string | null;
  latitude: number | null;
  longitude: number | null;
};

type SheetState = "collapsed" | "half" | "full";

const COLLAPSED_H = 52;

function snapHeights() {
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  return { collapsed: COLLAPSED_H, half: Math.round(vh * 0.45), full: Math.round(vh * 0.85) };
}

function closestSnap(h: number): SheetState {
  const heights = snapHeights();
  const choices: Array<{ state: SheetState; h: number }> = [
    { state: "collapsed", h: heights.collapsed },
    { state: "half", h: heights.half },
    { state: "full", h: heights.full },
  ];
  return choices.reduce((best, c) =>
    Math.abs(c.h - h) < Math.abs(best.h - h) ? c : best
  ).state;
}

export default function NewsIncidentFeed({
  items,
  onViewMap,
}: {
  items: NewsIncidentItem[];
  onViewMap: (coords: { latitude: number; longitude: number; zoom: number }) => void;
}) {
  const [sheetState, setSheetState] = useState<SheetState>("collapsed");
  const [heightPx, setHeightPxRaw]  = useState<number>(COLLAPSED_H);

  const heightRef = useRef(COLLAPSED_H);
  const setHeightPx = useCallback((h: number) => {
    heightRef.current = h;
    setHeightPxRaw(h);
  }, []);

  const dragStart = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);

  useEffect(() => {
    const sync = () => setHeightPx(snapHeights()[sheetState]);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [sheetState, setHeightPx]);

  const toggle = useCallback(() => {
    setSheetState((prev) => (prev === "collapsed" ? "half" : "collapsed"));
  }, []);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const at = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bt = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return bt - at;
    });
  }, [items]);

  const isOpen = sheetState !== "collapsed";

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-radiant-surface/95 backdrop-blur-xl border-t border-radiant-border transition-[height] duration-250 ease-out"
      style={{ height: heightPx }}
    >
      {/* Handle / toggle */}
      <button
        aria-label={isOpen ? "Collapse news feed" : "Open news feed"}
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
          const heights = snapHeights();
          const next = Math.max(heights.collapsed, Math.min(heights.full, dragStart.current.startHeight + delta));
          setHeightPx(next);
        }}
        onPointerUp={() => {
          if (!dragStart.current) return;
          const wasDrag = dragStart.current.moved;
          dragStart.current = null;
          if (wasDrag) {
            setSheetState(closestSnap(heightRef.current));
          } else {
            toggle();
          }
        }}
        onPointerCancel={() => { dragStart.current = null; }}
        onClick={(e) => e.stopPropagation()}
      >
        {isOpen ? (
          <>
            <div className="h-1 w-10 rounded-full bg-gray-600 group-hover:bg-gray-400 transition-colors" />
            <div className="flex items-center gap-1.5 text-[11px] text-gray-600 group-hover:text-gray-400 transition-colors">
              <ChevronDown className="h-3 w-3" />
              <span>drag or tap to close</span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-radiant-card border border-radiant-border px-5 py-2 shadow-lg shadow-black/40 group-hover:border-gray-500 transition-colors">
            <Newspaper className="h-3.5 w-3.5 text-radiant-red" />
            <span className="text-sm font-semibold text-gray-100">Crime News</span>
            <ChevronUp className="h-4 w-4 text-gray-400 group-hover:text-gray-200 transition-colors" />
          </div>
        )}
      </button>

      {isOpen && (
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-lg font-bold text-gray-100">Crime News</h2>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Zap className="h-3 w-3 text-radiant-green" />
            Scraped Updates
          </div>
        </div>
      )}

      {isOpen && (
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div className="flex flex-col gap-3">
          {sorted.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-radiant-border bg-radiant-card p-4 transition-colors hover:border-gray-600"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-gray-100">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {item.areaName ?? "Location unknown"}
                  </p>
                </div>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-lg border border-radiant-border bg-radiant-dark px-2.5 py-1.5 text-xs text-gray-300 hover:border-gray-500 hover:text-white"
                    aria-label="Open source"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              <div className="mt-3 flex items-center justify-end">
                <button
                  disabled={item.latitude == null || item.longitude == null}
                  onClick={() =>
                    item.latitude != null &&
                    item.longitude != null &&
                    onViewMap({ latitude: item.latitude, longitude: item.longitude, zoom: 16 })
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    item.latitude == null || item.longitude == null
                      ? "border-radiant-border text-gray-600 cursor-not-allowed"
                      : "border-radiant-border bg-radiant-dark text-gray-300 hover:border-gray-500 hover:text-white"
                  )}
                >
                  <MapPin className="h-3 w-3" />
                  View Map
                </button>
              </div>
            </div>
          ))}
          {sorted.length === 0 && (
            <div className="rounded-xl border border-radiant-border bg-radiant-card p-4 text-sm text-gray-400">
              No news incidents found.
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
