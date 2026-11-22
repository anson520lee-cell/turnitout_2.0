import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { Check, FileCheck2 } from "lucide-react";
import { services, type ServiceKind } from "@/config/services";
import { buttonClasses } from "@/components/ui/button";
import { Build } from "@/components/motion/reveal";
import { PriceRuler } from "@/components/landing/price-ruler";
import { PaymentMethodStrip } from "@/components/orders/payment-methods";
import { cn } from "@/lib/utils";

const kindMeta: Record<ServiceKind, { label: string; icon: typeof FileCheck2; text: string }> = {
  screening: { label: "Report", icon: FileCheck2, text: "text-accent" },
};

export function PricingCards({ headingAs: Heading = "h3", ruler = true }: { headingAs?: "h2" | "h3"; ruler?: boolean } = {}) {
  return (
    <>
      <div className={cn("mx-auto grid items-stretch gap-6", ruler ? "max-w-5xl lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-8" : "max-w-md")}>
        {services.map((s) => {
          const k = kindMeta[s.kind];
          return (
            <Build key={s.id} r={20} className="h-full">
              <div data-tilt className={cn("price-card relative flex h-full flex-col rounded-[20px] p-6 sm:p-7", s.highlight ? "glass-strong" : "glass")}>
                {s.highlight && <span aria-hidden className="price-card-top" />}
                {s.highlight && (
                  <span data-pop className="price-badge">
                    AI-writing risk
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <span data-pop className={cn("grid size-11 place-items-center rounded-xl border border-[var(--line-strong)]", k.text)}>
                    <k.icon className="size-5" aria-hidden />
                  </span>
                  <p className={cn("font-mono text-[11px] uppercase tracking-[0.16em]", k.text)}>{k.label}</p>
                </div>
                <Heading className="mt-5 text-[18px] font-semibold tracking-tight">{s.name}</Heading>
                <p className="mt-1.5 min-h-[44px] text-[13px] leading-relaxed text-fg-muted">{s.short}</p>
                <div data-pop className="mt-5">
                  <p className="text-[40px] font-semibold leading-none tracking-[-0.03em]">{s.priceLabel}</p>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">{s.cadence}</p>
                </div>
                <ul className="mt-5 flex-1 space-y-2.5 border-t border-[var(--line)] pt-5">
                  {s.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[13px] text-fg-muted">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={s.href} className={buttonClasses(s.highlight ? "primary" : "secondary", s.highlight ? "lg" : "md", "mt-6 w-full")}>
                  {s.cta}
                </Link>
              </div>
            </Build>
          );
        })}
        {ruler && (
          <Build r={20} className="h-full">
            <PriceRuler className="h-full" />
          </Build>
        )}
      </div>
      <PaymentMethodStrip className="mt-8 justify-center" />
      <p className="mt-4 text-center text-[12px] text-fg-subtle">
        Prices in Hong Kong dollars.
      </p>
    </>
  );
}
