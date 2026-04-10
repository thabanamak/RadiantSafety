"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X, MapPin, Navigation } from "lucide-react";
import { cn } from "@/lib/cn";
import type { UserReport } from "@/lib/types";
import { MELBOURNE_AREAS, type MelbourneArea } from "@/lib/melbourne-areas";

type SearchResult =
  | { kind: "area"; data: MelbourneArea }
  | { kind: "incident"; data: UserReport };

interface SearchBarProps {
  reports: UserReport[];
  onSelectIncident: (report: UserReport) => void;
  onSelectArea: (coords: { latitude: number; longitude: number; zoom: number }) => void;
}

export default function SearchBar({ reports, onSelectIncident, onSelectArea }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();

  const results: SearchResult[] = q.length < 2
    ? []
    : [
        ...MELBOURNE_AREAS
          .filter((a) => a.name.toLowerCase().includes(q))
          .slice(0, 5)
          .map((a): SearchResult => ({ kind: "area", data: a })),
        ...reports
          .filter(
            (r) =>
              r.category.toLowerCase().includes(q) ||
              r.description.toLowerCase().includes(q)
          )
          .slice(0, 5)
          .map((r): SearchResult => ({ kind: "incident", data: r })),
      ];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (result: SearchResult) => {
    if (result.kind === "area") {
      onSelectArea({
        latitude: result.data.latitude,
        longitude: result.data.longitude,
        zoom: result.data.zoom,
      });
    } else {
      onSelectIncident(result.data);
    }
    setQuery("");
    setIsFocused(false);
  };

  const areaResults = results.filter((r) => r.kind === "area");
  const incidentResults = results.filter((r) => r.kind === "incident");

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border bg-radiant-card/80 backdrop-blur-md px-3 py-2 transition-all",
          isFocused ? "border-gray-500 bg-radiant-card" : "border-radiant-border"
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-gray-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="Search areas, suburbs, incidents..."
          className="w-full bg-transparent text-xs text-gray-200 placeholder-gray-600 outline-none"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="shrink-0 text-gray-500 hover:text-gray-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isFocused && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-radiant-border bg-radiant-surface/95 p-1.5 shadow-2xl backdrop-blur-xl">
          {areaResults.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                Areas
              </p>
              {areaResults.map((r) => {
                const area = r.data as MelbourneArea;
                return (
                  <button
                    key={area.name}
                    onClick={() => handleSelect(r)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-radiant-card"
                  >
                    <Navigation className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                    <span className="text-xs font-medium text-gray-200">{area.name}</span>
                  </button>
                );
              })}
            </>
          )}

          {areaResults.length > 0 && incidentResults.length > 0 && (
            <div className="my-1 h-px bg-radiant-border" />
          )}

          {incidentResults.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                Incidents
              </p>
              {incidentResults.map((r) => {
                const report = r.data as UserReport;
                return (
                  <button
                    key={report.id}
                    onClick={() => handleSelect(r)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-radiant-card"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-radiant-red" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-200">
                        {report.category}
                      </p>
                      <p className="truncate text-[11px] text-gray-500">
                        {report.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      {isFocused && q.length >= 2 && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1.5 rounded-xl border border-radiant-border bg-radiant-surface/95 p-4 text-center shadow-2xl backdrop-blur-xl">
          <p className="text-xs text-gray-500">No results for &ldquo;{query}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
