/** True when this navigation likely came from a Supabase email link (tokens in URL). */
export function isEmailLinkCallback(): boolean {
  if (typeof window === "undefined") return false;
  const { hash, search } = window.location;
  if (
    hash &&
    /access_token|refresh_token|type=signup|type=email_change/i.test(hash)
  ) {
    return true;
  }
  const params = new URLSearchParams(search);
  if (
    params.has("code") ||
    params.has("token_hash") ||
    params.get("type") === "signup" ||
    params.get("type") === "recovery"
  ) {
    return true;
  }
  return false;
}
