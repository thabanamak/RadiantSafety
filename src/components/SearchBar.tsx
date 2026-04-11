"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, MapPin, Building2, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  searchboxSuggest,
  searchboxRetrieve,
  newSessionToken,
  type SearchSuggestion,
  MELB_CBD_PROXIMITY,
} from "@/lib/mapbox-forward-geocode";

interface SearchBarProps {
  mapCenter?: { latitude: number; longitude: number } | null;
  onSelectArea: (payload: {
    latitude: number;
    longitude: number;
    zoom: number;
    placeName: string;
    center: [number, number];
  }) => void;
}

function highlightMatch(text: string, query: string) {
  if (!query) return <span className="text-gray-200">{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span className="text-gray-200">{text}</span>;
  return (
    <>
      <span className="text-gray-400">{text.slice(0, idx)}</span>
      <span className="font-semibold text-white">{text.slice(idx, idx + query.length)}</span>
      <span className="text-gray-400">{text.slice(idx + query.length)}</span>
    </>
  );
}

function poiIcon(featureType: string) {
  if (featureType === "poi") return <Building2 className="h-4 w-4 text-cyan-400" />;
  return <MapPin className="h-4 w-4 text-gray-400" />;
}

export default function SearchBar({ mapCenter, onSelectArea }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [results, setResults] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selecting, setSelecting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Session token must persist across suggest calls and be passed to retrieve
  const sessionTokenRef = useRef<string>(newSessionToken());

  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const showDropdown = isFocused && query.trim().length > 0 && !selecting;

  const suggest = useCallback(
    async (q: string) => {
      if (!token || q.length === 0) { setResults([]); return; }

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      try {
        const proximity = mapCenter
          ? `${mapCenter.longitude},${mapCenter.latitude}`
          : MELB_CBD_PROXIMITY;

        const items = await searchboxSuggest(q, token, {
          sessionToken: sessionTokenRef.current,
          proximity,
          limit: 8,
          signal: abortRef.current.signal,
        });
        setResults(items);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [token, mapCenter]
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) { setResults([]); setLoading(false); return; }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => suggest(q), 280);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, suggest]);

  useEffect(() => { setActiveIndex(-1); }, [results]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const closeDropdown = useCallback(() => {
    setQuery("");
    setResults([]);
    setIsFocused(false);
    setActiveIndex(-1);
  }, []);

  const handleSelect = useCallback(
    async (suggestion: SearchSuggestion) => {
      if (!token) return;
      setSelecting(true);
      setLoading(true);
      try {
        const loc = await searchboxRetrieve(
          suggestion.mapbox_id,
          token,
          sessionTokenRef.current
        );
        // Rotate session token now that this session (suggest+retrieve) is complete
        sessionTokenRef.current = newSessionToken();

        if (!loc) return;
        const label = suggestion.place_formatted
          ? `${suggestion.name}, ${suggestion.place_formatted}`
          : suggestion.name;
        onSelectArea({
          longitude: loc.coordinates[0],
          latitude: loc.coordinates[1],
          zoom: suggestion.feature_type === "poi" ? 17 : 14,
          placeName: label,
          center: loc.coordinates,
        });
        closeDropdown();
      } finally {
        setSelecting(false);
        setLoading(false);
      }
    },
    [token, onSelectArea, closeDropdown]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      void handleSelect(results[activeIndex]);
    } else if (e.key === "Escape") {
      setIsFocused(false);
      setActiveIndex(-1);
    }
  };

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl">
      {/* Input */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border-2 bg-black/60 backdrop-blur-xl px-4 py-3 transition-all duration-200 shadow-2xl",
          isFocused
            ? "border-radiant-red/60 bg-black/80 shadow-red-500/20"
            : "border-white/10 hover:border-white/20"
        )}
      >
        {loading
          ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-radiant-red" />
          : <Search className={cn("h-5 w-5 shrink-0 transition-colors", isFocused ? "text-radiant-red" : "text-gray-500")} />
        }
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="Stations, malls, landmarks, suburbs, or streets…"
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-transparent text-sm font-medium text-gray-100 placeholder-gray-500 outline-none"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setActiveIndex(-1); inputRef.current?.focus(); }}
            className="shrink-0 rounded-full p-0.5 text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-black/90 shadow-2xl backdrop-blur-xl">
          {results.length > 0 ? (
            <div ref={listRef} className="max-h-72 overflow-y-auto py-1.5">
              {results.map((s, i) => (
                <button
                  key={s.mapbox_id}
                  type="button"
                  onClick={() => void handleSelect(s)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    activeIndex === i ? "bg-white/10" : "hover:bg-white/5"
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/8">
                    {poiIcon(s.feature_type)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">
                      {highlightMatch(s.name, query.trim())}
                    </p>
                    <p className="truncate text-[11px] text-gray-500">{s.place_formatted}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : !loading ? (
            <div className="px-4 py-5 text-center">
              <p className="text-sm text-gray-500">
                No results for <span className="text-gray-300">&ldquo;{query}&rdquo;</span>
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
