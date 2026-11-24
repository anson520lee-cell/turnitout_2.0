import type { Metadata } from "next";
import { BusinessDashboard } from "@/components/admin/business-dashboard";
import { periods } from "@/lib/analytics/business";
import { businessAnalytics } from "@/lib/data/business-analytics";

export const metadata: Metadata = { title: "Business analytics" };

export default async function AnalyticsPage({ searchParams }: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const requested = (await searchParams).period;
  const period = periods.find(p => p === requested) ?? "30";
  const data = await businessAnalytics(period);
  return <BusinessDashboard key={period} data={data} period={period}/>;
}
