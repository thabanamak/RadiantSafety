/**
 * Display name from Supabase Auth `user_metadata` (OAuth / email signup).
 */
export function displayNameFromMetadata(
  metadata: Record<string, unknown> | undefined,
  emailFallback: string
): string {
  if (!metadata || typeof metadata !== "object") {
    return emailFallback.split("@")[0] || "User";
  }
  const full =
    typeof metadata.full_name === "string"
      ? metadata.full_name.trim()
      : typeof metadata.name === "string"
        ? metadata.name.trim()
        : "";
  if (full) return full;
  const user =
    typeof metadata.user_name === "string"
      ? metadata.user_name.trim()
      : typeof metadata.preferred_username === "string"
        ? metadata.preferred_username.trim()
        : "";
  if (user) return user;
  return emailFallback.split("@")[0] || "User";
}
