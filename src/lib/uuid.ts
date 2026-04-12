/**
 * Generates a UUID v4.
 * Uses crypto.randomUUID() when available (HTTPS / secure contexts).
 * Falls back to a Math.random-based implementation for plain-HTTP dev testing
 * (e.g. accessing via local IP on iPhone Safari).
 */
export function randomUUID(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
