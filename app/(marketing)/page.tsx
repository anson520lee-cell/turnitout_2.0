import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { FalsePositives } from "@/components/landing/false-positives";
import { PricingCards } from "@/components/landing/pricing-cards";
import { PrivacySection } from "@/components/landing/privacy-section";
import { IntegritySection } from "@/components/landing/integrity-section";
import { FaqList } from "@/components/landing/faq-list";
import { Container, SectionHeading } from "@/components/ui/section";
import { JsonLd } from "@/components/seo/json-ld";
import { faq } from "@/config/faq";
import { brand } from "@/config/app";
import { appUrl } from "@/lib/utils";
import Link from "next/link";

/**
 * The homepage reads as one story, in three movements:
 *
 * 1. The promise and the path: hero, then the five steps from draft to
 *    report, then the dashboard where you follow those steps.
 * 2. How to read the result: why genuine writing can still be flagged, then
 *    what each service costs.
 * 3. Reassurance and close: privacy controls, the integrity policy, FAQ, and
 *    the final call to action.
 *
 * Kept off the homepage because they repeated a neighbour: the two service
 * cards (the pricing cards show the same two services, with prices and
 * buttons; the cards live on /services) and the scroll-pinned draft-to-report
 * story (the same five steps as How it works; it lives on /how-it-works).
 */
export default function HomePage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", "@id": `${appUrl()}/#org`, name: brand.name, url: appUrl(), description: brand.description },
            { "@type": "WebSite", "@id": `${appUrl()}/#site`, name: brand.name, url: appUrl(), description: brand.tagline, publisher: { "@id": `${appUrl()}/#org` } },
          ],
        }}
      />
      <Hero />
      <HowItWorks />
      <DashboardPreview />
      <FalsePositives />
      <section id="pricing" className="py-24 sm:py-32">
        <Container>
          <SectionHeading
            align="center"
            eyebrow="Services & pricing"
            title="Two services, simple per-document pricing."
            body="Start with your free daily report. Pay only when you need more, or writing refinement."
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
    </>
  );
}
