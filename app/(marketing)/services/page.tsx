import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { CoreServices } from "@/components/landing/core-services";
import { Container } from "@/components/ui/section";

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
      <Container className="max-w-3xl pb-24">
        <div data-tilt="5" className="glass rounded-2xl p-6 text-[14px] leading-relaxed text-fg-muted">
          <h2 className="text-[15px] font-semibold text-fg">Add-on: Writing Refinement</h2>
          <p className="mt-2">
            After a report is finished, you can ask for a rewrite of each flagged sentence, made to bring the AI score down: the result is re-checked by the same detector and what still reads as AI is rewritten again. To get the score down a suggestion may change what a sentence says; numbers, names, quotations and citations are never changed, and you choose which suggestions to use. It costs three times the price of the report and is charged only when suggestions are ready. It does not guarantee any result in any checker.
          </p>
          <p className="mt-3">
            <Link href="/sample-report" className="font-medium text-fg underline-offset-2 hover:underline">See an example</Link>
            {" · "}
            <Link href="/pricing" className="font-medium text-fg underline-offset-2 hover:underline">Pricing</Link>
          </p>
        </div>
      </Container>
    </>
  );
}
