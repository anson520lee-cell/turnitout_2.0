import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/app-header";
import { ScreeningForm } from "@/components/orders/screening-form";
import { Badge } from "@/components/ui/badge";
import { screeningType } from "@/lib/validation/schemas";

export const metadata: Metadata = { title: "Request screening" };

export default async function Page({ searchParams }: PageProps<"/services/screening">) {
  const { type } = await searchParams;
  const parsed = screeningType.safeParse(type);
  return (
    <>
      <AppHeader
        eyebrow={<Badge tone="info" dot>Human-processed · Turnitin-backed</Badge>}
        title="Request AI & similarity screening"
        body="Upload your document. A reviewer runs it through Turnitin with repository storage off, then uploads the result and report it returned."
      />
      <ScreeningForm initialType={parsed.success ? parsed.data : "combined_screening"} />
    </>
  );
}
