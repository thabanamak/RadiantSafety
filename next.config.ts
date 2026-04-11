import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["rss-parser"],
  /** Reuse server SUPABASE_URL in the browser when NEXT_PUBLIC_SUPABASE_URL is unset. */
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
  },
  devIndicators: {
    position: "top-right",
  },
  /**
   * Pin Turbopack’s project root so Next doesn’t treat a parent folder
   * (e.g. `C:\\Users\\…` with its own lockfile) as the workspace root.
   */
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
