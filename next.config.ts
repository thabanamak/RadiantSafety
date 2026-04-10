import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // rss-parser uses Node.js built-ins (http, https, sax) that webpack can't
  // bundle for server components — mark it external so Next.js requires it
  // natively at runtime instead of attempting to bundle it.
  serverExternalPackages: ["rss-parser"],
};

export default nextConfig;
