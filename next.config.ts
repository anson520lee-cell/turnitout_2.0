import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The free scan and Writing Refinement were removed; old links go to the report page, which has the daily free report.
  async redirects() {
    return [
      { source: "/scan", destination: "/services/screening", permanent: true },
      { source: "/scan/history", destination: "/dashboard", permanent: true },
      { source: "/services/refinement", destination: "/services/screening", permanent: true },
    ];
  },
};

export default nextConfig;
