import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { ReportExplorer } from "@/components/orbital/report-explorer";
import { ReportSteps } from "@/components/orbital/report-journey";

export const metadata: Metadata = {
  title: "How it works",
  description: "From pasting your text to a finished AI-writing risk report: how 0% works, step by step.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title="From draft to report."
        body="Submit your text, watch the scan, and see what the reviewer flagged. Your first report each day is free."
      />
      <div className="orb-container pb-20">
        <ReportSteps />
        <div className="mt-10 lg:mt-16"><ReportExplorer /></div>
        <section className="mt-12 grid gap-6 border-t border-[var(--line)] pt-7 md:grid-cols-[1fr_1.25fr]">
          <div>
            <p className="orb-label">Reading your results</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">What a flag means</h2>
          </div>
          <div>
            <p className="max-w-[60ch] text-[15px] leading-relaxed text-fg-muted">
              A flag points to a pattern worth reviewing. Formal, formulaic, and second-language writing can trigger the same signals, so use the sentence notes to decide whether a change helps your draft.
            </p>
            <Link href="/academic-integrity" className="orb-inline-link mt-3">Academic integrity <ArrowUpRight size={17} aria-hidden="true" /></Link>
          </div>
        </section>
      </div>
    </>
  );
}
