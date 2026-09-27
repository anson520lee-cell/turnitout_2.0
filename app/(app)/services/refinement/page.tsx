import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/app-header";
import { RefinementForm } from "@/components/orders/refinement-form";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Writing review" };

export default function Page() {
  return (
    <>
      <AppHeader
        eyebrow={<Badge tone="progress" dot>Human-reviewed</Badge>}
        title="Academic writing refinement"
        body="A reviewer improves clarity, flow and phrasing in your own writing while keeping your meaning, citations and voice."
      />
      <RefinementForm />
    </>
  );
}
