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
        title="Preliminary scan, screening, and writing review."
        body="Three separate services. The scan is our estimate; the screening is an actual Turnitin result from a human-processed workflow; writing review is human editing of your own work."
      />
      <CoreServices />
      <Comparison />
      <Container>
        <p className="text-center text-[12.5px] text-fg-subtle">{disclaimers.turnitin}</p>
      </Container>
    </>
  );
}
