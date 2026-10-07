import { Hero } from "@/components/landing/hero";
import { PatternEngine } from "@/components/landing/pattern-engine";
import { CoreServices } from "@/components/landing/core-services";
import { AnalysisPreview } from "@/components/landing/analysis-preview";
import { Comparison } from "@/components/landing/comparison";
import { FalsePositives } from "@/components/landing/false-positives";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ScrollStory } from "@/components/landing/scroll-story";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { PricingCards } from "@/components/landing/pricing-cards";
import { PrivacySection } from "@/components/landing/privacy-section";
import { IntegritySection } from "@/components/landing/integrity-section";
import { FaqList } from "@/components/landing/faq-list";
import { FinalCta } from "@/components/landing/final-cta";
import { Container, SectionHeading } from "@/components/ui/section";
import { faq } from "@/config/faq";
import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <Hero />
      <PatternEngine />
      <CoreServices />
      <AnalysisPreview />
      <Comparison />
      <FalsePositives />
      <HowItWorks />
      <ScrollStory />
      <DashboardPreview />
      <section id="pricing" className="py-24 sm:py-32">
        <Container>
          <SectionHeading
            align="center"
            eyebrow="Pricing"
            title="Simple, per-document pricing."
            body="Start free. Pay only when you need a report or writing refinement."
          />
          <div className="mt-14">
            <PricingCards />
          </div>
        </Container>
      </section>
      <PrivacySection />
      <IntegritySection />
      <section className="py-24 sm:py-32">
        <Container className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
          <SectionHeading
            eyebrow="FAQ"
            title="Straight answers."
            body={
              <>
                More in the <Link href="/faq" className="text-accent hover:underline">full FAQ</Link>.
              </>
            }
          />
          <FaqList items={faq.slice(0, 7)} />
        </Container>
      </section>
      <FinalCta />
    </>
  );
}
