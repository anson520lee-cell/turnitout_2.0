import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/ui/section";
import { buttonClasses } from "@/components/ui/button";
import { ScreeningReport } from "@/components/reports/screening-report";
import { formatCredits, screeningPrices } from "@/config/pricing";
import { reportService } from "@/config/services";
import type { Order, ScreeningResultRow } from "@/types/domain";

export const metadata: Metadata = {
  title: "Sample report",
  description: "What an AI & similarity report from 0% looks like, shown with example data.",
  alternates: { canonical: "/sample-report" },
};

// Example data only: no customer, no real document. The page uses the same
// component a customer sees on a finished order.
const order: Order = {
  id: "00000000-0000-4000-8000-000000000000",
  user_id: "00000000-0000-4000-8000-000000000000",
  service_type: reportService,
  status: "completed",
  title: "Example: Sociology essay – final draft",
  price: screeningPrices[reportService],
  currency: "hkd",
  word_count: 2140,
  instructions: null,
  source_text: null,
  admin_checklist: { no_repository_confirmed: true, external_copy_removed: true },
  created_at: "2026-09-30T08:12:00.000Z",
  updated_at: "2026-09-30T10:40:00.000Z",
  paid_at: "2026-09-30T08:14:00.000Z",
  completed_at: "2026-09-30T10:40:00.000Z",
  cancelled_at: null,
  source_deleted_at: null,
};

const result: ScreeningResultRow = {
  id: "00000000-0000-4000-8000-000000000001",
  order_id: order.id,
  provider: "turnitin",
  ai_indicator: 12,
  ai_indicator_note: null,
  similarity_percentage: 8,
  screening_completed_at: "2026-09-30T10:38:00.000Z",
  report_storage_path: null,
  report_file_name: null,
  result_metadata: {},
  admin_notes: null,
};

export default function SampleReportPage() {
  return (
    <>
      <PageHeader
        eyebrow="Sample report"
        title="What you get back"
        body={`This is the page a customer sees when a report is ready, filled with example data. A report costs ${formatCredits(screeningPrices[reportService])}.`}
      />
      <Container className="max-w-4xl pb-24">
        <p className="mb-5 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/[0.07] px-4 py-3 text-[14px] leading-relaxed text-fg">
          <Info className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          Example only. The numbers below are made up to show the layout; they are not a real customer&rsquo;s result. A real
          order also includes the report file to open or download.
        </p>
        <ScreeningReport order={order} file={null} result={result} />
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
