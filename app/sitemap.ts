import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const pages: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/scan", priority: 0.9 },
  { path: "/services", priority: 0.8 },
  { path: "/services/screening", priority: 0.8 },
  { path: "/services/refinement", priority: 0.8 },
  { path: "/pricing", priority: 0.8 },
  { path: "/how-it-works", priority: 0.6 },
  { path: "/faq", priority: 0.6 },
  { path: "/about", priority: 0.5 },
  { path: "/academic-integrity", priority: 0.4 },
  { path: "/privacy", priority: 0.3 },
  { path: "/terms", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map(({ path, priority }) => ({ url: `${base}${path}`, changeFrequency: "monthly", priority }));
}
