import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/app-header";
import { RefinementRequest } from "@/components/orders/refinement-request";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Writing Refinement" };

export default function Page() {
  return (
    <>
      <AppHeader
        eyebrow={<Badge tone="progress" dot>Human-reviewed</Badge>}
        title="Writing Refinement"
        body="A reviewer refines the clarity, flow and style of your own writing, keeping your meaning, citations and voice."
      />
      <RefinementRequest />
    </>
  );
}
