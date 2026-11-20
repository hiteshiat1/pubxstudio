import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turbopack inside this repository when a parent directory has a lockfile.
  turbopack: { root: process.cwd() },
  // No static export — server actions required
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
