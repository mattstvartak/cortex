import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Standalone output bundles the minimal runtime deps, so the Docker
  // image doesn't have to ship all of node_modules.
  output: "standalone",
  // Rewrites let us proxy /api/cortex/* to the cortex API without
  // hard-coding its URL at build time. Resolves at request time on the
  // Next server: inside docker compose this is http://cortex:4141; in
  // local dev (cortex start child), http://127.0.0.1:4141.
  async rewrites() {
    const apiBase = process.env.CORTEX_API_URL ?? "http://127.0.0.1:4141";
    return [
      {
        source: "/api/cortex/:path*",
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

export default config;
