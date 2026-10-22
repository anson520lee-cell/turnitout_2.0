import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { CoreServices } from "@/components/landing/core-services";
import { Comparison } from "@/components/landing/comparison";

export const metadata: Metadata = {
  title: "Services",
  description: "Three services: a free preliminary writing scan, automatic AI-writing risk reports, and writing refinement.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Services"
        title="Preliminary scan, AI-writing risk report, and writing refinement."
        body="Three separate services. The scan is a quick estimate; the report reads your whole text and maps where it could be misread as AI-written; refinement is editing of your own writing for clarity, flow and style."
      />
      <CoreServices />
      <Comparison />
    </>
  );
}
