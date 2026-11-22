import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { CoreServices } from "@/components/landing/core-services";
import { Container } from "@/components/ui/section";
import { Build } from "@/components/motion/reveal";

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
        title="The AI-writing"
        outline="risk report."
        body="The report reads your whole text and maps where it could be misread as AI-written. It is ready in a few minutes."
      />
      <CoreServices />
      <Container className="pb-24">
        <Build r={20} className="mx-auto max-w-5xl">
          <div data-tilt="" className="addon glass rounded-[20px]">
            <p className="addon-label">Add-on</p>
            <h2 className="mt-3 text-[19px] font-semibold tracking-tight text-fg">Writing Refinement</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">
              After a report is finished, you can ask for a rewrite of each flagged sentence, made to bring the AI score down: the result is re-checked by the same detector and what still reads as AI is rewritten again. To get the score down a suggestion may change what a sentence says; numbers, names, quotations and citations are never changed, and you choose which suggestions to use. It costs three times the price of the report and is charged only when suggestions are ready. It does not guarantee any result in any checker.
            </p>
            <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px]">
              <Link href="/sample-report" className="link-line text-fg-muted">See an example</Link>
              <Link href="/pricing" className="link-line text-fg-muted">Pricing</Link>
            </p>
          </div>
        </Build>
      </Container>
    </>
  );
}
