import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ScrollStory } from "@/components/landing/scroll-story";
import { Comparison } from "@/components/landing/comparison";

export const metadata: Metadata = {
  title: "How it works",
  description: "From a free preliminary scan to a screening report or refined draft: how each 0% service works, step by step.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title="From draft to report, step by step."
        body="The free scan runs instantly on our servers. The report is a separate paid order that reads your whole text and is ready in about a minute."
      />
      <HowItWorks heading={false} />
      <ScrollStory />
      <Comparison />
    </>
  );
}
