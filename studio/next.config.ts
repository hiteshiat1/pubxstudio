import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No static export — server actions required
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
