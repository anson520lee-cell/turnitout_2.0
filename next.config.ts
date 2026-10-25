import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The free scan was removed; old links go to the report page, which has the daily free report.
  async redirects() {
    return [
      { source: "/scan", destination: "/services/screening", permanent: true },
      { source: "/scan/history", destination: "/dashboard", permanent: true },
    ];
  },
};

export default nextConfig;
