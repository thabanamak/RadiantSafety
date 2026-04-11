"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, MapPin, Building2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SelectedDestination } from "@/components/ContextualDirectionsCards";
import {
  searchboxSuggest,
  searchboxRetrieve,
  newSessionToken,
  type SearchSuggestion,
  MELB_CBD_PROXIMITY,
} from "@/lib/mapbox-forward-geocode";

type Props = {
  id: string;
  label: string;
  mapCenter?: { latitude: number; longitude: number } | null;
  value: SelectedDestination | null;
  onChange: (next: SelectedDestination | null) => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function RouteLocationField({
  id,
  label,
  mapCenter,
  value,
  onChange,
  placeholder = "Station, landmark, suburb, or address…",
  disabled = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [results, setResults] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<string>(newSessionToken());
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const showDropdown = isFocused && query.trim().length > 0 && !value;

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
          limit: 6,
          signal: abortRef.current.signal,
        });
        setResults(items);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [token, mapCenter]
  );

  useEffect(() => {
    if (value || query.trim().length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => suggest(query.trim()), 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, value, suggest]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pick = useCallback(
    async (s: SearchSuggestion) => {
      if (!token) return;
      setLoading(true);
      try {
        const loc = await searchboxRetrieve(s.mapbox_id, token, sessionTokenRef.current);
        sessionTokenRef.current = newSessionToken();
        if (!loc) return;
        const name = s.place_formatted
          ? `${s.name}, ${s.place_formatted}`
          : s.name;
        onChange({ name, coordinates: loc.coordinates });
      } finally {
        setLoading(false);
        setQuery("");
        setResults([]);
        setIsFocused(false);
      }
    },
    [token, onChange]
  );

  return (
    <div ref={containerRef} className="relative text-left">
      <label htmlFor={id} className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </label>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 py-2.5">
          <MapPin className="h-4 w-4 shrink-0 text-cyan-400" />
          <p className="min-w-0 flex-1 truncate text-sm text-white">{value.name}</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
            aria-label="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <input
              id={id}
              type="text"
              disabled={disabled}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              placeholder={placeholder}
              autoComplete="off"
              className={cn(
                "w-full rounded-xl border border-white/12 bg-zinc-900/80 px-3 py-2.5 text-sm text-white outline-none ring-0 placeholder:text-zinc-500",
                "focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30",
                disabled && "opacity-50"
              )}
            />
            {loading && (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-500" />
            )}
          </div>
          {showDropdown && results.length > 0 && (
            <ul
              className="absolute z-[80] mt-1 max-h-48 w-full overflow-auto rounded-xl border border-white/12 bg-zinc-950 py-1 shadow-2xl"
              role="listbox"
            >
              {results.map((s) => (
                <li key={s.mapbox_id} role="option">
                  <button
                    type="button"
                    disabled={disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void pick(s)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/10"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/6">
                      {s.feature_type === "poi"
                        ? <Building2 className="h-3.5 w-3.5 text-cyan-400" />
                        : <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                      }
                    </div>
                    <div className="min-w-0">
                      <span className="block font-medium text-white">{s.name}</span>
                      <span className="block truncate text-[11px] text-zinc-500">{s.place_formatted}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
