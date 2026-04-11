/**
 * Browser Geolocation with retries (high accuracy first, then network/Wi‑Fi).
 * Works on localhost; production should be served over HTTPS for GPS in most browsers.
 */

export type Wgs84Point = { latitude: number; longitude: number };

export function explainGeoError(err: GeolocationPositionError | Error): string {
  if ("code" in err && typeof (err as GeolocationPositionError).code === "number") {
    const code = (err as GeolocationPositionError).code;
    if (code === 1) {
      return "Location blocked. Allow access in the browser address bar, or use “Map view” / manual coordinates.";
    }
    if (code === 2) {
      return "Position unavailable. Try “Map view” or manual coordinates.";
    }
    if (code === 3) {
      return "Location timed out. Try again outdoors, or use “Map view”.";
    }
  }
  return err.message || "Could not get location.";
}

export type GeolocationMode = "full" | "routing";

/**
 * Try precise fix first, then faster / cached reading.
 *
 * - `full` (default): cached fix first (instant if recent), then GPS capped at 12s, then network fallback — ~23s worst case.
 * - `routing`: favours cached / network fixes first, caps ~14s — avoids blocking
 *   “Get Safe Route” on long GPS timeouts indoors.
 */
export async function getCurrentPositionBestEffort(
  options?: { mode?: GeolocationMode }
): Promise<Wgs84Point> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Geolocation is not supported in this browser.");
  }

  const mode: GeolocationMode = options?.mode ?? "full";

  const attempts: PositionOptions[] =
    mode === "routing"
      ? [
          { enableHighAccuracy: false, timeout: 4_000, maximumAge: 300_000 },
          { enableHighAccuracy: false, timeout: 5_000, maximumAge: 60_000 },
          { enableHighAccuracy: false, timeout: 5_000, maximumAge: 0 },
        ]
      : [
          // Return a recent cached fix instantly if one exists (covers most returning users).
          { enableHighAccuracy: false, timeout: 3_000, maximumAge: 120_000 },
          // Fresh GPS fix — capped at 12s so we don't hang.
          { enableHighAccuracy: true,  timeout: 12_000, maximumAge: 0 },
          // Network / Wi-Fi fallback.
          { enableHighAccuracy: false, timeout: 8_000,  maximumAge: 0 },
        ];

  let lastError: GeolocationPositionError | Error | null = null;

  for (const options of attempts) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
    } catch (e) {
      lastError = e as GeolocationPositionError;
    }
  }

  throw lastError ?? new Error("Geolocation failed.");
}

export function parseManualCoords(latStr: string, lngStr: string): Wgs84Point {
  const latitude = Number.parseFloat(latStr);
  const longitude = Number.parseFloat(lngStr);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Enter valid numbers for latitude and longitude.");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error("Latitude must be −90…90 and longitude −180…180.");
  }
  return { latitude, longitude };
}
