import path from "path";
import type { NextConfig } from "next";

/**
 * GitHub Pages serves `https://<user>.github.io/<repo>/` — set at build time:
 *   NEXT_PUBLIC_BASE_PATH=/RadiantSafety   (leading slash, no trailing slash)
 * Omit on Vercel / root domain. See https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath
 */
function normalizeBasePath(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s || s === "/") return undefined;
  const withSlash = s.startsWith("/") ? s : `/${s}`;
  const trimmed = withSlash.replace(/\/+$/, "");
  return trimmed === "" ? undefined : trimmed;
}

const basePath = normalizeBasePath(
  process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH
);
const assetPrefixRaw =
  process.env.NEXT_PUBLIC_ASSET_PREFIX?.trim() ??
  process.env.ASSET_PREFIX?.trim() ??
  "";
const assetPrefix = assetPrefixRaw === "" ? undefined : assetPrefixRaw.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  ...(assetPrefix ? { assetPrefix } : {}),
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
