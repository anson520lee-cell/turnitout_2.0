import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/app-header";
import { ReportRequest } from "@/components/orders/report-request";
import { Badge } from "@/components/ui/badge";
import { reportService, serviceLabels } from "@/config/services";

export const metadata: Metadata = { title: "Get a report" };

// Older links pass ?type=ai_screening etc.; every new request is the combined report.
export default function Page() {
  return (
    <>
      <AppHeader
        eyebrow={<Badge tone="info" dot>Human-processed · Turnitin-backed</Badge>}
        title={serviceLabels[reportService]}
        body="Paste your text and pay once. A reviewer runs it through Turnitin with repository storage off, then records exactly what the screening returned: the AI-writing indicator, the similarity result and the report file where available."
      />
      <ReportRequest />
    </>
  );
}
