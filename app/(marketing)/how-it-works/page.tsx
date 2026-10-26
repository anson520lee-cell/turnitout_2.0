import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ScrollStory } from "@/components/landing/scroll-story";

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
        title="From draft to report, step by step."
        body="The report reads your whole text and is ready in a few minutes, while you watch a live scan of your text. Your first report each day is free."
      />
      <HowItWorks heading={false} />
      <ScrollStory />
    </>
  );
}
