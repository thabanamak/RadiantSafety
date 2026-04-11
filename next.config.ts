import type { NextConfig } from "next";

/**
 * Mirror server-only Supabase URL into NEXT_PUBLIC_* so browser code (e.g. SOS panel)
 * can use the same project URL when only SUPABASE_URL is set in .env.local.
 */
function stripTrailingSlash(v: string | undefined): string {
  return (v ?? "").trim().replace(/\/$/, "");
}

const supabasePublicUrl =
  stripTrailingSlash(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
  stripTrailingSlash(process.env.SUPABASE_URL);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["rss-parser"],
  devIndicators: {
    position: "top-right",
  },
  env: {
    ...(supabasePublicUrl
      ? { NEXT_PUBLIC_SUPABASE_URL: supabasePublicUrl }
      : {}),
  },
};

export default nextConfig;
