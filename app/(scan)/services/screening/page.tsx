import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/app-header";
import { ReportRequest } from "@/components/orders/report-request";
import { Badge } from "@/components/ui/badge";
import { reportService, serviceLabels } from "@/config/services";
import { formatHKD, screeningPrices } from "@/config/pricing";

export const metadata: Metadata = {
  title: "Get a report",
  description: `Order an AI and similarity report: paste your text and our team runs the screening and sends you the result. ${formatHKD(screeningPrices[reportService])} per report.`,
  alternates: { canonical: "/services/screening" },
};

// Older links pass ?type=ai_screening etc.; every new request is the combined report.
export default function Page() {
  return (
    <>
      <AppHeader
        eyebrow={<Badge tone="info" dot>Human-processed · Turnitin screening</Badge>}
        title={serviceLabels[reportService]}
        body="Paste your text and pay once. A reviewer runs it through Turnitin with repository storage off, then records exactly what the screening returned: the AI-writing indicator, the similarity result and the report file where available."
      />
      <ReportRequest />
    </>
  );
}
