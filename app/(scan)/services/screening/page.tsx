import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { DailyReportCard } from "@/components/orders/daily-report-card";
import { getFreeReportStatus } from "@/lib/free-report";
import { ReportRequest } from "@/components/orders/report-request";
import { reportFromLabel, reportRateLabel, reportService, serviceLabels } from "@/config/services";

export const metadata: Metadata = {
  title: "Get a report",
  description: `An AI-writing risk report on your own text: paste it and get an overall level, a map of every paragraph and the sentences to look at again, with a PDF. ${reportFromLabel}, ${reportRateLabel}.`,
  alternates: { canonical: "/services/screening" },
};

// Older links pass ?type=ai_screening etc.; every new request is the combined report.
export default async function Page() {
  const dailyReport = await getFreeReportStatus();
  return (
    <>
      <AppHeader
        eyebrow={<span className="orb-label"><span className="orb-indicator" /> New report</span>}
        title={serviceLabels[reportService]}
        body={
          <>
            Paste a draft to see where its writing patterns may be flagged. Your report includes a paragraph map, sentence-level reasons, and a downloadable PDF.{" "}
            <Link href="/sample-report" className="text-accent underline-offset-4 hover:underline">
              See a sample report
            </Link>
            .
          </>
        }
      />
      <DailyReportCard status={dailyReport} className="mb-6" />
      <ReportRequest />
    </>
  );
}
