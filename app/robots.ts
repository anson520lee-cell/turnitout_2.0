import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/** Public pages are open to search engines; account, admin and API routes aren't. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/dashboard", "/orders", "/settings", "/scan/history", "/api/", "/auth/", "/preview/", "/reset-password"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
