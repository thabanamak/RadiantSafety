import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["rss-parser"],
  devIndicators: {
    position: "top-right",
  },
};

export default nextConfig;
