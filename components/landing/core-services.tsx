import Link from "next/link";
import { ArrowUpRight, Gauge, FileCheck2, PenLine } from "lucide-react";
import { Container, SectionHeading } from "@/components/ui/section";
import { SpotlightCard } from "@/components/motion/spotlight-card";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { freeScan } from "@/config/app";
import { formatHKD, refinementPricing, screeningPrices } from "@/config/pricing";

const cards = [
  {
    icon: Gauge,
    tag: <Badge tone="accent">Free · Instant</Badge>,
    title: "Preliminary Writing Scan",
    body: "Our own analysis of sentence rhythm, transitions, phrasing and structure. A fast first look at patterns detectors tend to weigh.",
    meta: `${freeScan.dailyLimit} per day · website-generated`,
    href: "/scan",
  },
  {
    icon: FileCheck2,
    tag: <Badge tone="info">Human-processed</Badge>,
    title: "AI & Similarity Screening",
    body: "Upload your document and we run it through a Turnitin screening workflow, then deliver the result that screening returned.",
    meta: `From ${formatHKD(Math.min(...Object.values(screeningPrices)))} · report delivered`,
    href: "/services/screening",
  },
  {
    icon: PenLine,
    tag: <Badge tone="progress">Human-reviewed</Badge>,
    title: "Writing Refinement",
    body: "A careful clarity and flow review of your own writing. Meaning, citations and your voice are preserved.",
    meta: `From ${formatHKD(refinementPricing.minimum)}`,
    href: "/services/refinement",
  },
];

export function CoreServices() {
  return (
    <section id="services" className="py-24 sm:py-32">
      <Container>
        <SectionHeading
          eyebrow="Three services"
          title="Three services, clearly separated."
          body="An instant estimate from us, a real screening result when you need one, and optional human editing. Each is labelled for exactly what it is."
        />
        <Stagger className="mt-14 grid gap-5 md:grid-cols-3">
          {cards.map((c) => (
            <StaggerItem key={c.title}>
              <SpotlightCard className="h-full">
                <Link href={c.href} className="flex h-full flex-col p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-xl border border-[var(--line)] bg-gradient-to-b from-white/[0.07] to-transparent">
                      <c.icon className="size-5 text-accent" aria-hidden />
                    </span>
                    {c.tag}
                  </div>
                  <h3 className="mt-6 text-lg font-semibold tracking-tight">{c.title}</h3>
                  <p className="mt-2 flex-1 text-[14px] leading-relaxed text-fg-muted">{c.body}</p>
                  <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-4 text-[12.5px] text-fg-subtle">
                    {c.meta}
                    <ArrowUpRight className="size-4 text-fg-muted transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
                  </div>
                </Link>
              </SpotlightCard>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
