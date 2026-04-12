"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ListFilter,
  Newspaper,
} from "lucide-react";
import { cn } from "@/lib/cn";

type CrimeSeverityTier = "low" | "medium" | "high";

export type NewsIncidentItem = {
  id: string;
  outlet?: string | null;
  title: string;
  url: string;
  publishedAt: string | null;
  areaName: string | null;
  latitude: number | null;
  longitude: number | null;
  /** VicPol keyword score 1–10; used for severity filter when present. */
  intensity?: number | null;
};

/** Aligned with map area summary: high ≥8, medium 5–7, low ≤4. */
function crimeTierFromIntensity(intensity: number): CrimeSeverityTier {
  if (intensity >= 8) return "high";
  if (intensity >= 5) return "medium";
  return "low";
}

function tierLabel(t: CrimeSeverityTier) {
  return t === "high" ? "High" : t === "medium" ? "Medium" : "Low";
}

function itemTier(item: NewsIncidentItem): CrimeSeverityTier | null {
  if (item.intensity == null || Number.isNaN(item.intensity)) return null;
  return crimeTierFromIntensity(item.intensity);
}

type SheetState = "collapsed" | "half" | "full";

/** Room for collapsed “Crime News” row + filter icon */
const COLLAPSED_H = 56;

/** Read iOS safe-area-inset-bottom in pixels (requires viewport-fit=cover). */
function safeAreaBottom(): number {
  if (typeof window === "undefined") return 0;
  try {
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;bottom:0;left:0;width:1px;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden";
    document.body.appendChild(el);
    const h = el.getBoundingClientRect().height;
    document.body.removeChild(el);
    return h;
  } catch {
    return 0;
  }
}

function snapHeights() {
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const safe = safeAreaBottom();
  return {
    collapsed: COLLAPSED_H + safe,
    half: Math.round(vh * 0.45),
    full: Math.round(vh * 0.85),
  };
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

type SeveritySortMode = "recent" | "severity-asc" | "severity-desc";

export default function NewsIncidentFeed({
  items,
  onViewMap,
}: {
  items: NewsIncidentItem[];
  onViewMap: (coords: { latitude: number; longitude: number; zoom: number }) => void;
}) {
  const [sheetState, setSheetState] = useState<SheetState>("collapsed");
  const [heightPx, setHeightPxRaw]  = useState<number>(COLLAPSED_H);

  const [filterOpen, setFilterOpen] = useState(false);
  const [showLow, setShowLow] = useState(true);
  const [showMedium, setShowMedium] = useState(true);
  const [showHigh, setShowHigh] = useState(true);
  const [severitySort, setSeveritySort] = useState<SeveritySortMode>("recent");
  const filterTriggerRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(
    null
  );

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

  const onSheetPointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
    dragStart.current = { startY: e.clientY, startHeight: heightRef.current, moved: false };
  }, []);

  const onSheetPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!dragStart.current) return;
      const delta = dragStart.current.startY - e.clientY;
      if (Math.abs(delta) > 4) dragStart.current.moved = true;
      if (!dragStart.current.moved) return;
      const heights = snapHeights();
      const next = Math.max(
        heights.collapsed,
        Math.min(heights.full, dragStart.current.startHeight + delta)
      );
      setHeightPx(next);
    },
    [setHeightPx]
  );

  const onSheetPointerUp = useCallback(() => {
    if (!dragStart.current) return;
    const wasDrag = dragStart.current.moved;
    dragStart.current = null;
    if (wasDrag) {
      setSheetState(closestSnap(heightRef.current));
    } else {
      toggle();
    }
  }, [toggle]);

  useLayoutEffect(() => {
    if (!filterOpen) {
      setMenuRect(null);
      return;
    }
    const el = filterTriggerRef.current;
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      const width = Math.min(280, Math.max(200, window.innerWidth - 24));
      const left = Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12));
      const top = r.bottom + 6;
      setMenuRect({ top, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [filterOpen, sheetState, heightPx]);

  useEffect(() => {
    if (!filterOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (filterTriggerRef.current?.contains(t)) return;
      if (menuPanelRef.current?.contains(t)) return;
      setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filterOpen]);

  const allSeveritiesOn = showLow && showMedium && showHigh;

  const filterSummary = useMemo(() => {
    if (allSeveritiesOn) return "All severities";
    const parts: string[] = [];
    if (showHigh) parts.push("High");
    if (showMedium) parts.push("Med");
    if (showLow) parts.push("Low");
    return parts.length ? parts.join(" · ") : "None";
  }, [allSeveritiesOn, showHigh, showLow, showMedium]);

  const sorted = useMemo(() => {
    const list = [...items];
    const ia = (x: NewsIncidentItem) => (x.intensity != null && !Number.isNaN(x.intensity) ? x.intensity : -1);
    const cmpRecent = (a: NewsIncidentItem, b: NewsIncidentItem) => {
      const at = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bt = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      if (bt !== at) return bt - at;
      return ia(b) - ia(a);
    };
    const cmpSeverity = (a: NewsIncidentItem, b: NewsIncidentItem, dir: 1 | -1) => {
      const va = ia(a);
      const vb = ia(b);
      if (va !== vb) return (va - vb) * dir;
      return cmpRecent(a, b);
    };

    if (severitySort === "severity-asc") list.sort((a, b) => cmpSeverity(a, b, 1));
    else if (severitySort === "severity-desc") list.sort((a, b) => cmpSeverity(a, b, -1));
    else list.sort(cmpRecent);
    return list;
  }, [items, severitySort]);

  const filtered = useMemo(() => {
    if (allSeveritiesOn) return sorted;
    return sorted.filter((item) => {
      const t = itemTier(item);
      if (t == null) return true;
      if (t === "high") return showHigh;
      if (t === "medium") return showMedium;
      return showLow;
    });
  }, [allSeveritiesOn, showHigh, showLow, showMedium, sorted]);

  const setTier = useCallback((tier: CrimeSeverityTier, on: boolean) => {
    if (tier === "high") setShowHigh(on);
    else if (tier === "medium") setShowMedium(on);
    else setShowLow(on);
  }, []);

  const toggleTier = useCallback(
    (tier: CrimeSeverityTier) => {
      const on =
        tier === "high" ? showHigh : tier === "medium" ? showMedium : showLow;
      const countOn = (showLow ? 1 : 0) + (showMedium ? 1 : 0) + (showHigh ? 1 : 0);
      if (on && countOn <= 1) return;
      setTier(tier, !on);
    },
    [showHigh, showLow, showMedium, setTier]
  );

  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [summaryLoading, setSummaryLoading] = useState<Record<string, boolean>>({});

  const ensureSummary = useCallback(async (item: NewsIncidentItem) => {
    if (!item.id) return;
    if (summaries[item.id]) return;
    if (!item.url) {
      setSummaries((p) => ({
        ...p,
        [item.id]: `Summary unavailable for \"${item.title}\". Open the source link for full details.`,
      }));
      return;
    }

    setSummaryLoading((p) => ({ ...p, [item.id]: true }));
    try {
      const res = await fetch(
        `/api/article-summary?url=${encodeURIComponent(item.url)}&title=${encodeURIComponent(
          item.title
        )}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as { summary?: string };
      setSummaries((p) => ({ ...p, [item.id]: data.summary ?? "Summary unavailable." }));
    } catch {
      setSummaries((p) => ({ ...p, [item.id]: "Summary unavailable." }));
    } finally {
      setSummaryLoading((p) => ({ ...p, [item.id]: false }));
    }
  }, [summaries]);

  const isOpen = sheetState !== "collapsed";

  const filterMenuPanel =
    filterOpen && menuRect ? (
      <div
        ref={menuPanelRef}
        className="fixed z-[10050] max-h-[min(70vh,520px)] overflow-y-auto rounded-xl border border-radiant-border bg-radiant-card p-3 shadow-2xl shadow-black/50"
        style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
        role="listbox"
        aria-label="Filter by crime severity"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Show severities
        </p>
        <ul className="mt-2 space-y-1">
          {(["high", "medium", "low"] as const).map((tier) => {
            const checked =
              tier === "high" ? showHigh : tier === "medium" ? showMedium : showLow;
            return (
              <li key={tier}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-radiant-dark">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-radiant-border bg-radiant-dark text-radiant-red focus:ring-radiant-red/40"
                    checked={checked}
                    onChange={() => toggleTier(tier)}
                  />
                  <span className="text-xs text-gray-200">{tierLabel(tier)} crime</span>
                </label>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="mt-2 w-full rounded-lg border border-radiant-border bg-radiant-dark py-1.5 text-xs font-semibold text-gray-300 hover:border-gray-500 hover:text-white"
          onClick={() => {
            setShowLow(true);
            setShowMedium(true);
            setShowHigh(true);
          }}
        >
          Show all
        </button>
        <div className="my-2 h-px bg-radiant-border" />
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Order</p>
        <div className="mt-1.5 flex flex-col gap-1">
          {(
            [
              ["recent", "Recent first"] as const,
              ["severity-asc", "Low → high"] as const,
              ["severity-desc", "High → low"] as const,
            ] as const
          ).map(([mode, label]) => (
            <label
              key={mode}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-radiant-dark"
            >
              <input
                type="radio"
                name="news-severity-sort"
                className="h-3 w-3 border-radiant-border bg-radiant-dark text-radiant-red focus:ring-radiant-red/40"
                checked={severitySort === mode}
                onChange={() => setSeveritySort(mode)}
              />
              <span className="text-xs text-gray-300">{label}</span>
            </label>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <>
      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-[60] flex min-h-0 flex-col overflow-x-hidden rounded-t-2xl bg-radiant-surface/95 backdrop-blur-xl border-t border-radiant-border transition-[height] duration-250 ease-out"
        style={{ height: heightPx }}
      >
        {isOpen ? (
          <button
            type="button"
            aria-label="Collapse news feed"
            className="group relative flex w-full cursor-grab touch-none select-none flex-col items-center gap-1.5 px-5 pt-3 pb-2 active:cursor-grabbing"
            onPointerDown={onSheetPointerDown}
            onPointerMove={onSheetPointerMove}
            onPointerUp={onSheetPointerUp}
            onPointerCancel={() => {
              dragStart.current = null;
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 w-10 rounded-full bg-gray-600 group-hover:bg-gray-400 transition-colors" />
            <div className="flex items-center gap-1.5 text-[11px] text-gray-600 group-hover:text-gray-400 transition-colors">
              <ChevronDown className="h-3 w-3" />
              <span>drag or tap to close</span>
            </div>
          </button>
        ) : (
          <div
            className="flex shrink-0 w-full touch-none select-none items-center justify-center gap-2 px-3 pt-2"
            style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom, 8px))" }}
          >
            <button
              type="button"
              aria-label="Open crime news"
              className="group flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-radiant-border bg-radiant-card px-4 py-2 shadow-lg shadow-black/40 touch-none hover:border-gray-500"
              onPointerDown={onSheetPointerDown}
              onPointerMove={onSheetPointerMove}
              onPointerUp={onSheetPointerUp}
              onPointerCancel={() => {
                dragStart.current = null;
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Newspaper className="h-3.5 w-3.5 shrink-0 text-radiant-red" />
              <span className="truncate text-sm font-semibold text-gray-100">VicPol Live</span>
              <ChevronUp className="h-4 w-4 shrink-0 text-gray-400 group-hover:text-gray-200 transition-colors" />
            </button>
          </div>
        )}

        {isOpen && (
          <div className="relative z-50 flex shrink-0 flex-wrap items-center justify-between gap-2 px-5 pb-3">
            <h2 className="text-lg font-bold text-gray-100">VicPol Live</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div ref={filterTriggerRef} className="relative inline-block">
                <button
                  type="button"
                  aria-expanded={filterOpen}
                  aria-haspopup="listbox"
                  onClick={() => setFilterOpen((o) => !o)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                    filterOpen
                      ? "border-radiant-red/60 bg-radiant-dark text-gray-100"
                      : "border-radiant-border bg-radiant-card text-gray-300 hover:border-gray-500 hover:text-white"
                  )}
                >
                  <ListFilter className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                  <span className="max-w-[140px] truncate">{filterSummary}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform",
                      filterOpen && "rotate-180"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {isOpen && (
      <div className="relative z-0 min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <div className="flex flex-col gap-3">
          {filtered.map((item) => {
            const activateCard = () => {
              if (item.latitude != null && item.longitude != null) {
                onViewMap({ latitude: item.latitude, longitude: item.longitude, zoom: 16 });
              }
              void ensureSummary(item);
            };
            const tier = itemTier(item);
            return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={activateCard}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  activateCard();
                }
              }}
              className={cn(
                "text-left rounded-xl border border-radiant-border bg-radiant-card p-4 transition-colors hover:border-gray-600 outline-none focus-visible:ring-2 focus-visible:ring-radiant-red/50",
                (item.latitude == null || item.longitude == null) ? "cursor-default" : "cursor-pointer"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="line-clamp-2 text-sm font-semibold text-gray-100">
                      {item.title}
                    </p>
                    {tier && (
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          tier === "high" && "bg-red-950/80 text-red-200 ring-1 ring-red-500/35",
                          tier === "medium" && "bg-amber-950/70 text-amber-200 ring-1 ring-amber-500/30",
                          tier === "low" && "bg-slate-800 text-slate-300 ring-1 ring-slate-600/40"
                        )}
                      >
                        {tierLabel(tier)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {item.areaName ?? "Location unknown"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-radiant-border bg-radiant-dark px-2.5 py-1.5 text-xs text-gray-300 hover:border-gray-500 hover:text-white"
                      aria-label="Open source"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                {!summaries[item.id] && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void ensureSummary(item);
                    }}
                    className="rounded-lg border border-radiant-border bg-radiant-dark px-3 py-1.5 text-xs font-semibold text-gray-300 hover:border-gray-500 hover:text-white"
                  >
                    {summaryLoading[item.id] ? "Generating…" : "Generate summary"}
                  </button>
                )}
                <div className="text-[11px] text-gray-500">
                  {item.outlet ? `Source: ${item.outlet}` : "Source: VicPol"}
                </div>
              </div>

              {summaries[item.id] && (
                <p className="mt-3 text-[12px] leading-relaxed text-gray-300">
                  {item.publishedAt && (
                    <span className="mr-1 text-[11px] font-medium text-gray-500">
                      {new Date(item.publishedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s/g, "").toUpperCase()}:
                    </span>
                  )}
                  {summaries[item.id]}
                </p>
              )}
            </div>
            );
          })}
          {filtered.length === 0 && items.length > 0 && (
            <div className="rounded-xl border border-radiant-border bg-radiant-card p-4 text-sm text-gray-400">
              No incidents match this severity filter. Open the filter and choose more levels or tap
              &quot;Show all&quot;.
            </div>
          )}
          {filtered.length === 0 && items.length === 0 && (
            <div className="rounded-xl border border-radiant-border bg-radiant-card p-4 text-sm text-gray-400">
              No news incidents found.
            </div>
          )}
        </div>
      </div>
        )}
      </div>
      {typeof document !== "undefined" &&
        filterMenuPanel &&
        createPortal(filterMenuPanel, document.body)}
    </>
  );
}
