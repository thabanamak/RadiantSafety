"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Newspaper } from "lucide-react";
import { cn } from "@/lib/cn";
import type { NewsIncidentItem } from "./NewsIncidentFeed";

export default function NewsSidebar() {
  const [items, setItems] = useState<NewsIncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/news-incidents", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        if (data.error) setError(data.error);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load news.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const top = items.slice(0, 15);
  const outletName = top.find((i) => i.outlet)?.outlet ?? "News";

  return (
    <aside className="pointer-events-auto absolute left-14 top-[148px] z-20 flex w-72 flex-col gap-3 rounded-2xl border border-radiant-border bg-radiant-surface/90 p-3 backdrop-blur-xl shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-gray-400" />
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-300">
            {outletName}
          </p>
        </div>
        <span className="rounded-full bg-radiant-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Official
        </span>
      </div>

      <div className="h-px bg-radiant-border" />

      {/* Content */}
      <div className="max-h-[58vh] overflow-y-auto pr-0.5">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-radiant-border bg-radiant-card px-3 py-3 text-xs text-gray-500">
            {error}
          </div>
        )}

        {!loading && !error && top.length === 0 && (
          <div className="rounded-xl border border-radiant-border bg-radiant-card px-3 py-3 text-xs text-gray-500">
            No official news found. Check <code className="text-gray-400">NEWS_RSS_URL</code> in your env.
          </div>
        )}

        {!loading && top.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {top.map((i) => (
              <a
                key={i.id}
                href={i.url || undefined}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "group flex items-start gap-2.5 rounded-xl border border-radiant-border bg-radiant-card px-3 py-2.5 transition-colors hover:border-gray-600 hover:bg-radiant-dark",
                  !i.url && "pointer-events-none opacity-50"
                )}
              >
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-600 group-hover:text-gray-300 transition-colors" />
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-gray-100">
                    {i.title}
                  </p>
                  {i.areaName && (
                    <p className="mt-0.5 text-[11px] text-gray-500">{i.areaName}</p>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
