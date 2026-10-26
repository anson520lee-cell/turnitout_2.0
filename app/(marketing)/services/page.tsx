import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { CoreServices } from "@/components/landing/core-services";

export const metadata: Metadata = {
  title: "Services",
  description: "Automatic AI-writing risk reports on your own text, with one free every day.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Services"
        title="The AI-writing risk report."
        body="The report reads your whole text and maps where it could be misread as AI-written. It is ready in a few minutes."
      />
      <CoreServices />
    </>
  );
}
