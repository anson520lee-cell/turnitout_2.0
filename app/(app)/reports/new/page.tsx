import type { Metadata } from "next";
import { ScreeningRequest } from "@/components/orders/screening-request";
import { getFreeReportStatus } from "@/lib/free-report";

export const metadata: Metadata = { title: "Get a report", robots: { index: false } };

export default async function NewReportPage() {
  return <ScreeningRequest status={await getFreeReportStatus()} />;
}
