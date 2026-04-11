/**
 * Mapbox Search Box API v6 helpers.
 *
 * v5 Geocoding lacks many Melbourne POIs (e.g. Melbourne Central, Flinders St
 * Station do not appear). v6 Search Box has full POI coverage and handles
 * stations, malls, streets, and suburbs in one API.
 *
 * Flow:
 *   1. `searchboxSuggest(q, token, { sessionToken, proximity, limit })`:
 *      called on each keystroke (debounced). Returns name + subtitle but NO
 *      coordinates — Mapbox charges per session, not per suggestion call.
 *   2. `searchboxRetrieve(mapboxId, token, sessionToken)`:
 *      called once when the user selects a suggestion. Returns coordinates.
 *      After this, generate a new sessionToken for the next search.
 */

export const MELB_CBD_PROXIMITY = "144.9631,-37.8136";
export const VICTORIA_BBOX = "140.9,-39.2,150.0,-33.9";

/** A single autocomplete suggestion from the v6 suggest endpoint. */
export interface SearchSuggestion {
  mapbox_id: string;
  name: string;           // primary label shown as the main row text
  place_formatted: string; // address shown as the subtitle
  feature_type: string;   // 'poi' | 'address' | 'locality' | 'street' | etc.
}

/** Resolved location returned by the v6 retrieve endpoint. */
export interface RetrievedLocation {
  coordinates: [number, number]; // [lng, lat]
  name: string;
  fullAddress: string;
}

function parseLngLat(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const lng = Number(raw[0]);
  const lat = Number(raw[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

/** Simple session token — must be the same across all suggest calls in one
 *  session AND the matching retrieve call. Regenerate after each retrieve. */
export function newSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ─── Suggest ──────────────────────────────────────────────────────────────────

export async function searchboxSuggest(
  q: string,
  token: string,
  opts: {
    sessionToken: string;
    proximity: string;
    limit: number;
    signal?: AbortSignal;
  }
): Promise<SearchSuggestion[]> {
  if (!q.trim() || !token) return [];

  const url = new URL("https://api.mapbox.com/search/searchbox/v1/suggest");
  url.searchParams.set("q", q);
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "au");
  url.searchParams.set("proximity", opts.proximity);
  url.searchParams.set("bbox", VICTORIA_BBOX);
  url.searchParams.set("language", "en");
  url.searchParams.set("limit", String(opts.limit));
  url.searchParams.set("session_token", opts.sessionToken);

  try {
    const res = await fetch(url.toString(), { signal: opts.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      suggestions?: Array<{
        mapbox_id: string;
        name: string;
        place_formatted?: string;
        feature_type?: string;
      }>;
    };
    return (data.suggestions ?? []).map((s) => ({
      mapbox_id: s.mapbox_id,
      name: s.name,
      place_formatted: s.place_formatted ?? "",
      feature_type: s.feature_type ?? "unknown",
    }));
  } catch {
    return [];
  }
}

// ─── Retrieve ─────────────────────────────────────────────────────────────────

export async function searchboxRetrieve(
  mapboxId: string,
  token: string,
  sessionToken: string,
  fallbackQuery?: string,
  proximity?: string
): Promise<RetrievedLocation | null> {
  if (!mapboxId || !token) return null;

  const url = new URL(
    `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("session_token", sessionToken);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      if (fallbackQuery?.trim()) {
        return await geocodeFallback(fallbackQuery, token, proximity);
      }
      return null;
    }
    const data = (await res.json()) as {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties?: { name?: string; full_address?: string };
      }>;
    };
    const feature = data.features?.[0];
    if (!feature?.geometry) return null;
    const parsed = parseLngLat(feature.geometry.coordinates);
    if (!parsed) return null;
    return {
      coordinates: parsed,
      name: feature.properties?.name ?? "",
      fullAddress: feature.properties?.full_address ?? "",
    };
  } catch {
    if (fallbackQuery?.trim()) {
      return geocodeFallback(fallbackQuery, token, proximity);
    }
    return null;
  }
}

async function geocodeFallback(
  query: string,
  token: string,
  proximity?: string
): Promise<RetrievedLocation | null> {
  const q = query.trim();
  if (!q || !token) return null;

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "au");
  url.searchParams.set("bbox", VICTORIA_BBOX);
  url.searchParams.set("language", "en");
  url.searchParams.set("limit", "1");
  if (proximity) {
    url.searchParams.set("proximity", proximity);
  }

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        center?: unknown;
        text?: string;
        place_name?: string;
      }>;
    };
    const feature = data.features?.[0];
    const coordinates = parseLngLat(feature?.center);
    if (!coordinates) return null;
    return {
      coordinates,
      name: feature?.text ?? "",
      fullAddress: feature?.place_name ?? "",
    };
  } catch {
    return null;
  }
}

// ─── Legacy v5 export (kept so existing imports compile) ──────────────────────
// These types are no longer used in the UI components but may be imported
// elsewhere. Remove when fully cleaned up.
export interface MapboxGeocodeFeature {
  id: string;
  text: string;
  place_name: string;
  center: [number, number];
  place_type?: string[];
}
