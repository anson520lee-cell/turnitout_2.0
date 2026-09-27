import Link from "next/link";
import { Check } from "lucide-react";
import { services, disclaimers } from "@/config/services";
import { buttonClasses } from "@/components/ui/button";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

export function PricingCards() {
  return (
    <>
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {services.map((s) => (
          <StaggerItem key={s.id} className="h-full">
            <div
              data-tilt="7"
              className={cn(
                "relative flex h-full flex-col rounded-2xl p-6",
                s.highlight ? "glass-strong border-accent/40 shadow-[0_0_0_1px_rgb(91_140_255/0.25),0_30px_60px_-30px_rgb(91_140_255/0.5)]" : "glass",
              )}
            >
              {s.highlight && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium text-white">
                  Most complete
                </span>
              )}
              <p
                className={cn(
                  "font-mono text-[10.5px] uppercase tracking-[0.16em]",
                  s.kind === "free" ? "text-cyan" : s.kind === "screening" ? "text-accent" : "text-violet",
                )}
              >
                {s.kind === "free" ? "Free · Preliminary" : s.kind === "screening" ? "Screening" : "Writing review"}
              </p>
              <h3 className="mt-3 text-[17px] font-semibold tracking-tight">{s.name}</h3>
              <p className="mt-1.5 min-h-[40px] text-[13px] leading-relaxed text-fg-muted">{s.short}</p>
              <p className="mt-5 text-[28px] font-semibold tracking-tight">{s.priceLabel}</p>
              <p className="text-[12px] text-fg-subtle">{s.cadence}</p>
              <ul className="mt-5 flex-1 space-y-2.5 border-t border-[var(--line)] pt-5">
                {s.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-[13px] text-fg-muted">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href={s.href} className={buttonClasses(s.highlight ? "primary" : "secondary", "md", "mt-6 w-full")}>
                {s.cta}
              </Link>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
      <p className="mt-8 text-center text-[12px] text-fg-subtle">
        Prices in Hong Kong dollars. {disclaimers.noGuarantee} {disclaimers.turnitin}
      </p>
    </>
  );
}
