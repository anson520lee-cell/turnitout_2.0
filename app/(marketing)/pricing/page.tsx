import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PricingCards } from "@/components/landing/pricing-cards";
import { Container } from "@/components/ui/section";
import { FaqList } from "@/components/landing/faq-list";
import { faq } from "@/config/faq";
import { refinementPricing, formatHKD } from "@/config/pricing";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Start free. Pay per document."
        body="The preliminary scan is free, three times a day. Screenings are priced per document; writing review is priced by length."
      />
      <Container>
        <PricingCards />
        <div className="glass mx-auto mt-12 max-w-3xl rounded-2xl p-6 text-[14px] leading-relaxed text-fg-muted">
          <h2 className="text-[15px] font-semibold text-fg">How writing review is priced</h2>
          <p className="mt-2">
            {formatHKD(refinementPricing.perBlock)} per {refinementPricing.blockWords} words, rounded up, with a minimum of{" "}
            {formatHKD(refinementPricing.minimum)}. You see the exact price before you pay. A new screening after a revision is a new order.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-3xl">
          <FaqList items={faq.filter((f) => /guarantee|difference|include|stored/i.test(f.q))} />
        </div>
      </Container>
    </>
  );
}
