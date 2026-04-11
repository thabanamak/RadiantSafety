"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SelectedDestination } from "@/components/ContextualDirectionsCards";

const VICTORIA_BBOX = "140.9,-39.2,150.0,-33.9";

interface GeocodingFeature {
  id: string;
  text: string;
  place_name: string;
  center: [number, number];
}

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
  placeholder = "Search address or place…",
  disabled = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [results, setResults] = useState<GeocodingFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const showDropdown = isFocused && query.trim().length > 0 && !value;

  const geocode = useCallback(
    async (q: string) => {
      if (!token || q.length === 0) {
        setResults([]);
        return;
      }
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      try {
        const proximity = mapCenter
          ? `${mapCenter.longitude},${mapCenter.latitude}`
          : "144.9631,-37.8136";
        const url = new URL(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
        );
        url.searchParams.set("access_token", token);
        url.searchParams.set("country", "au");
        url.searchParams.set("bbox", VICTORIA_BBOX);
        url.searchParams.set("proximity", proximity);
        url.searchParams.set("types", "place,locality,neighborhood,district,poi,address");
        url.searchParams.set("limit", "6");
        const res = await fetch(url.toString(), { signal: abortRef.current.signal });
        const data = (await res.json()) as { features?: GeocodingFeature[] };
        setResults(data.features ?? []);
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
    debounceRef.current = setTimeout(() => geocode(query.trim()), 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, value, geocode]);

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
    (f: GeocodingFeature) => {
      onChange({
        name: f.place_name,
        coordinates: f.center,
      });
      setQuery("");
      setResults([]);
      setIsFocused(false);
    },
    [onChange]
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
              {results.map((f) => (
                <li key={f.id} role="option">
                  <button
                    type="button"
                    disabled={disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(f)}
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-white/10"
                  >
                    <span className="font-medium text-white">{f.text}</span>
                    <span className="truncate text-[11px] text-zinc-500">{f.place_name}</span>
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
