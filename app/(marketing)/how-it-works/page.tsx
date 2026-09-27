import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ScrollStory } from "@/components/landing/scroll-story";
import { Comparison } from "@/components/landing/comparison";

export const metadata: Metadata = { title: "How it works" };

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title="From draft to report, step by step."
        body="The free scan runs instantly on our servers. Screening is a separate, human-processed order: we run the permitted screening outside this website and record exactly what it returned."
      />
      <HowItWorks heading={false} />
      <ScrollStory />
      <Comparison />
    </>
  );
}
