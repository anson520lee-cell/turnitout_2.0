import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/app-header";
import { RefinementRequest } from "@/components/orders/refinement-request";
import { Badge } from "@/components/ui/badge";
import { localModelEnabled } from "@/lib/local-model/jobs";
import { localModel } from "@/config/app";
import { refinementRateLabel } from "@/config/services";

export const metadata: Metadata = {
  title: "Writing Refinement",
  description: `A reviewer refines the clarity, flow and style of your own writing, keeping your meaning, citations and voice. ${refinementRateLabel}.`,
  alternates: { canonical: "/services/refinement" },
};

export default function Page() {
  return (
    <>
      <AppHeader
        eyebrow={<Badge tone="progress" dot>Human-reviewed</Badge>}
        title="Writing Refinement"
        body="A reviewer refines the clarity, flow and style of your own writing, keeping your meaning, citations and voice."
      />
      <RefinementRequest modelDrafts={localModelEnabled() && localModel.refinementDrafts} />
    </>
  );
}
