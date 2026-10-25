import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The free scan has been removed: get report is the only product entry point.
  // Old links, bookmarks and search results go to the report page.
  async redirects() {
    return [
      { source: "/scan", destination: "/services/screening", permanent: true },
      { source: "/scan/history", destination: "/services/screening", permanent: true },
      { source: "/preview/free-scan", destination: "/services/screening", permanent: false },
      { source: "/preview/app-modules", destination: "/services/screening", permanent: false },
      { source: "/preview/daily-report", destination: "/preview/free-report", permanent: false },
    ];
  },
};

export default nextConfig;
