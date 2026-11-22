import type { Metadata } from "next";
import { ArrowUpRight, ScanLine, SquarePen } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { freeReport } from "@/config/app";
import { rewritePricing } from "@/config/pricing";

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
        title="Read. Understand. Revise."
        body="Start with a risk report to see what stands out. Use Writing Refinement to review suggested revisions after your report is ready."
      />
      <div className="orb-container pb-20">
        <div className="orb-price-grid orb-service-grid">
          <article>
            <div className="orb-process-marker"><ScanLine size={24} strokeWidth={1.4} aria-hidden="true" /></div>
            <p className="orb-label">AI-writing risk report</p>
            <h2>Find the signals.</h2>
            <p className="!max-w-[50ch]">Get an overall risk level, a map of flagged paragraphs, sentence-level explanations, grammar notes, and a PDF. You can check up to {freeReport.maxChars.toLocaleString("en-HK")} characters in your free daily report.</p>
            <Link href="/services/screening" className="orb-inline-link">Get a report <ArrowUpRight size={17} aria-hidden="true" /></Link>
          </article>
          <article>
            <div className="orb-process-marker"><SquarePen size={24} strokeWidth={1.4} aria-hidden="true" /></div>
            <p className="orb-label">Writing Refinement</p>
            <h2>Try a revision.</h2>
            <p className="!max-w-[50ch]">Compare flagged sentences with suggested rewrites and choose which to keep. This optional add-on costs {rewritePricing.multiple} times the report price in credits, charged when suggestions are ready. Review changes in meaning before accepting them.</p>
            <Link href="/sample-report#writing-refinement" className="orb-inline-link">View an example <ArrowUpRight size={17} aria-hidden="true" /></Link>
          </article>
        </div>
      </div>
    </>
  );
}
