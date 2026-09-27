import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { CoreServices } from "@/components/landing/core-services";
import { Comparison } from "@/components/landing/comparison";
import { Container } from "@/components/ui/section";
import { disclaimers } from "@/config/services";

export const metadata: Metadata = { title: "Services" };

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Services"
        title="Preliminary scan, Turnitin report, and writing refinement."
        body="Three separate services. The scan is our own estimate; the report is the actual result of a human-processed Turnitin screening; refinement is human editing of your own writing for clarity, flow and style."
      />
      <CoreServices />
      <Comparison />
      <Container>
        <p className="text-center text-[12.5px] text-fg-subtle">{disclaimers.turnitin}</p>
      </Container>
    </>
  );
}
