import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { AppHeader } from "@/components/layout/app-header";
import { DailyReportCard, type DailyReportStatus } from "@/components/orders/daily-report-card";
import { ReportRequest } from "@/components/orders/report-request";
import { Badge } from "@/components/ui/badge";
import { reportService, serviceLabels } from "@/config/services";

export function ScreeningRequest({ status, preview }: { status: DailyReportStatus; preview?: boolean }) {
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
      <DailyReportCard status={status} paidHref="#paid-report" preview={preview} className="mb-6" />
      <ReportRequest preview={preview} />
    </>
  );
}
