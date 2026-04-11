import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["rss-parser"],
  /**
   * Pin Turbopack’s project root so Next doesn’t treat a parent folder
   * (e.g. `C:\\Users\\…` with its own lockfile) as the workspace root.
   * Using `outputFileTracingRoot` for this caused `next build` failures here
   * (PageNotFoundError for routes); `turbopack.root` silences the warning safely.
   */
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
