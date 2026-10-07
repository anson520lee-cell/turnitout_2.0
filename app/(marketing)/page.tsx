import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { PatternEngine } from "@/components/landing/pattern-engine";
import { AnalysisPreview } from "@/components/landing/analysis-preview";
import { FalsePositives } from "@/components/landing/false-positives";
import { Comparison } from "@/components/landing/comparison";
import { PricingCards } from "@/components/landing/pricing-cards";
import { PrivacySection } from "@/components/landing/privacy-section";
import { IntegritySection } from "@/components/landing/integrity-section";
import { FaqList } from "@/components/landing/faq-list";
import { FinalCta } from "@/components/landing/final-cta";
import { Container, SectionHeading } from "@/components/ui/section";
import { faq } from "@/config/faq";
import Link from "next/link";

/**
 * The homepage reads as one story, in four movements:
 *
 * 1. The promise and the path: hero, then the five steps from draft to
 *    report, then the dashboard where you follow those steps.
 * 2. The technology behind the free scan: the Pattern Engine, the engine on
 *    an example paragraph, and how to read its signals (why genuine writing
 *    can still be flagged).
 * 3. The decision: an estimate vs an actual screening result, then what each
 *    costs.
 * 4. Reassurance and close: privacy controls, the integrity policy, FAQ, and
 *    the final call to action.
 *
 * Kept off the homepage because they repeated a neighbour: the three service
 * cards (the pricing cards show the same three services, with prices and
 * buttons; the cards live on /services) and the scroll-pinned draft-to-report
 * story (the same five steps as How it works; it lives on /how-it-works).
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <DashboardPreview />
      <PatternEngine />
      <AnalysisPreview />
      <FalsePositives />
      <Comparison />
      <section id="pricing" className="py-24 sm:py-32">
        <Container>
          <SectionHeading
            align="center"
            eyebrow="Services & pricing"
            title="Three services, simple per-document pricing."
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
