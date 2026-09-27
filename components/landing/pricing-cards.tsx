import Link from "next/link";
import { Check, FileCheck2, Gauge, PenLine } from "lucide-react";
import { services, disclaimers, type ServiceKind } from "@/config/services";
import { buttonClasses } from "@/components/ui/button";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { PaymentMethodStrip } from "@/components/orders/payment-methods";
import { cn } from "@/lib/utils";

const kindMeta: Record<ServiceKind, { label: string; icon: typeof Gauge; text: string; glow: string }> = {
  free: { label: "Free · Preliminary", icon: Gauge, text: "text-cyan", glow: "rgb(95 216 245 / 0.45)" },
  screening: { label: "Report", icon: FileCheck2, text: "text-accent", glow: "rgb(91 140 255 / 0.55)" },
  refinement: { label: "Writing Refinement", icon: PenLine, text: "text-violet", glow: "rgb(154 123 255 / 0.5)" },
};

/** A 1.5px light that runs around the highlighted card's edge. */
function RunningEdge() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      style={{
        padding: "1.5px",
        WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        WebkitMaskComposite: "xor",
        mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
      }}
    >
      <div className="absolute left-1/2 top-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2 bg-[conic-gradient(from_0deg,transparent_0deg,transparent_230deg,#5fd8f5_280deg,#5b8cff_310deg,#9a7bff_335deg,transparent_360deg)] motion-safe:animate-[spin_6s_linear_infinite]" />
    </div>
  );
}

export function PricingCards() {
  return (
    <>
      <Stagger className="mx-auto grid max-w-6xl items-stretch gap-5 md:grid-cols-3">
        {services.map((s) => {
          const k = kindMeta[s.kind];
          return (
            <StaggerItem key={s.id} className={cn("h-full", s.highlight && "md:-translate-y-3")}>
              <div
                data-tilt="8"
                className={cn(
                  "relative flex h-full flex-col rounded-2xl p-6 sm:p-7",
                  s.highlight
                    ? "glass-strong border-accent/40 shadow-[0_0_0_1px_rgb(91_140_255/0.25),0_40px_80px_-30px_rgb(91_140_255/0.55)]"
                    : "glass",
                )}
              >
                {s.highlight && <RunningEdge />}
                {s.highlight && (
                  <div aria-hidden className="pointer-events-none absolute -top-px left-1/2 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#b9ccff] to-transparent" />
                )}
                {s.highlight && (
                  <span
                    data-pop
                    className="absolute -top-3 left-6 rounded-full bg-gradient-to-b from-[#6c97ff] to-accent-strong px-3 py-1 text-[11px] font-medium text-white shadow-[0_8px_24px_-8px_rgb(91_140_255/0.8)]"
                  >
                    Most requested
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <span
                    data-pop
                    className={cn(
                      "grid size-11 place-items-center rounded-xl border border-[var(--line)] bg-gradient-to-b from-white/[0.09] to-transparent",
                      k.text,
                    )}
                    style={{ boxShadow: `0 12px 30px -12px ${k.glow}` }}
                  >
                    <k.icon className="size-5" aria-hidden />
                  </span>
                  <p className={cn("font-mono text-[10.5px] uppercase tracking-[0.16em]", k.text)}>{k.label}</p>
                </div>
                <h3 className="mt-5 text-[18px] font-semibold tracking-tight">{s.name}</h3>
                <p className="mt-1.5 min-h-[44px] text-[13px] leading-relaxed text-fg-muted">{s.short}</p>
                <div data-pop className="mt-5">
                  <p className={cn("text-[34px] font-semibold leading-none tracking-tight", s.highlight && "text-gradient")}>{s.priceLabel}</p>
                  <p className="mt-2 text-[12px] text-fg-subtle">{s.cadence}</p>
                </div>
                <ul className="mt-5 flex-1 space-y-2.5 border-t border-[var(--line)] pt-5">
                  {s.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[13px] text-fg-muted">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={s.href} className={buttonClasses(s.highlight ? "primary" : "secondary", s.highlight ? "lg" : "md", "mt-6 w-full")}>
                  {s.cta}
                </Link>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>
      <PaymentMethodStrip className="mt-8 justify-center" />
      <p className="mt-4 text-center text-[12px] text-fg-subtle">
        Prices in Hong Kong dollars. {disclaimers.noGuarantee} {disclaimers.turnitin}
      </p>
    </>
  );
}
