import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/ui/section";
import { buttonClasses } from "@/components/ui/button";
import { AutoReportView } from "@/components/reports/auto-report-view";
import { sampleReport } from "@/lib/auto-report/sample";
import { reportFromLabel, reportRateLabel } from "@/config/services";

export const metadata: Metadata = {
  title: "Sample report",
  description: "What an AI-writing risk report from 0% looks like, shown with example data.",
  alternates: { canonical: "/sample-report" },
};

export default function SampleReportPage() {
  return (
    <>
      <PageHeader
        eyebrow="Sample report"
        title="What you get back"
        body={`This is the page a customer sees when a report is ready, filled with example data. ${reportFromLabel}, ${reportRateLabel}.`}
      />
      <Container className="max-w-4xl pb-24">
        <p className="mb-5 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/[0.07] px-4 py-3 text-[14px] leading-relaxed text-fg">
          <Info className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          Example only. The text and ratings below are made up to show the layout; they are not a real customer&rsquo;s result. A real
          report is made from your own text and has a Download PDF button.
        </p>
        <AutoReportView title="Example: Sociology essay, final draft" finishedAt="30 Sep 2026, 10:40" result={sampleReport} />
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/services/screening" className={buttonClasses("primary", "lg")}>
            Get a report
          </Link>
          <Link href="/scan" className={buttonClasses("secondary", "lg")}>
            Try a free scan first
          </Link>
        </div>
      </Container>
    </>
  );
}
