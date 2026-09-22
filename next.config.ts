import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  poweredByHeader: false,
  webpack(config, { dev }) {
    // Deterministic production builds in ephemeral workspaces; dev keeps its cache.
    if (!dev) config.cache = false;
    return config;
  },
  experimental: { cpus: 2 },
};
export default config;
