import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { Check, FileCheck2 } from "lucide-react";
import { services } from "@/config/services";
import { buttonClasses } from "@/components/ui/button";
import { PaymentMethodStrip } from "@/components/orders/payment-methods";

export function PricingCards({ headingAs: Heading = "h3" }: { headingAs?: "h2" | "h3" } = {}) {
  return (
    <>
      {services.map((service) => (
        <article className="price-sheet" key={service.id}>
          <div className="price-summary">
            <div className="price-caption">
              {service.highlight && <span>AI-writing risk</span>}
              <span>
                <FileCheck2 size={15} aria-hidden />
                Report
              </span>
            </div>
            <Heading>{service.name}</Heading>
            <p>{service.short}</p>
            <div className="price-value">
              <strong>{service.priceLabel}</strong>
              <small>{service.cadence}</small>
            </div>
            <Link
              href={service.href}
              className={buttonClasses(service.highlight ? "primary" : "secondary", "lg")}
            >
              {service.cta}
            </Link>
          </div>
          <ul className="price-features">
            {service.features.map((feature) => (
              <li key={feature}>
                <Check size={15} aria-hidden />
                {feature}
              </li>
            ))}
          </ul>
        </article>
      ))}
      <PaymentMethodStrip className="mt-8 justify-center" />
      <p className="mt-4 text-center text-[12px] text-fg-subtle">Prices in Hong Kong dollars.</p>
    </>
  );
}
