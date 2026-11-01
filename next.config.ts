import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // These routes read these from disk at request time.
  outputFileTracingIncludes: {
    "/api/state-ballot": ["./src/data/state/*.json", "./src/data/state/counties/*/*.json", "./src/data/positions/*.json"],
    "/api/contests": ["./src/data/positions/*.json", "./src/data/finance2026.json"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
