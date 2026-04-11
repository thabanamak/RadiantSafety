const DEVICE_ID_KEY = "radiant_device_id";

/**
 * Returns a stable anonymous UUID for this device.
 * Generated once via crypto.randomUUID(), persisted to localStorage forever.
 * No auth required — swappable for auth.uid() later without schema changes.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";

  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;

  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
