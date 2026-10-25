import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { CoreServices } from "@/components/landing/core-services";

export const metadata: Metadata = {
  title: "Services",
  description: "Two services: automatic AI-writing risk reports (your first one is free) and writing refinement.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Services"
        title="AI-writing risk report and writing refinement."
        body="Two separate services. The report reads your whole text and maps where it could be misread as AI-written, and your first one is free; refinement is editing of your own writing for clarity, flow and style."
      />
      <CoreServices />
    </>
  );
}
