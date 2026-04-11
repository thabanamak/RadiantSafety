import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["rss-parser"],
  /**
   * Dev: give slow disks / AV more time to serve chunks.
   * Only mutate `chunkLoadTimeout` — do not replace `config.output` (Next relies on
   * non-enumerable fields; spreading can break chunk URLs and cause ChunkLoadError).
   */
  webpack: (config, { dev }) => {
    if (dev && config.output && typeof config.output === "object") {
      (config.output as { chunkLoadTimeout?: number }).chunkLoadTimeout = 300_000;
    }
    return config;
  },
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
