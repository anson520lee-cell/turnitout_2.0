import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { ReportRequest } from "@/components/orders/report-request";
import { Badge } from "@/components/ui/badge";
import { reportFromLabel, reportRateLabel, reportService, serviceLabels } from "@/config/services";

export const metadata: Metadata = {
  title: "Get a report",
  description: `An AI-writing risk report on your own text: paste it and get an overall level, a map of every paragraph and the sentences to look at again, with a PDF. ${reportFromLabel}, ${reportRateLabel}.`,
  alternates: { canonical: "/services/screening" },
};

// Older links pass ?type=ai_screening etc.; every new request is the combined report.
export default function Page() {
  return (
    <>
      <AppHeader
        eyebrow={<Badge tone="info" dot>Automatic · ready in a few minutes</Badge>}
        title={serviceLabels[reportService]}
        body={
          <>
            Paste your text and pay by length. The report reads every sentence and every paragraph, and shows where your writing could be
            misread as AI-written: an overall level, a map of your text, the sentences to look at again and grammar spots, with a PDF to download.{" "}
            <Link href="/sample-report" className="text-accent underline-offset-4 hover:underline">
              See a sample report
            </Link>
            .
          </>
        }
      />
      <ReportRequest />
    </>
  );
}
