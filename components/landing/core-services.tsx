import Link from "next/link";
import { ArrowUpRight, FileCheck2 } from "lucide-react";
import { Container, SectionHeading } from "@/components/ui/section";
import { SpotlightCard } from "@/components/motion/spotlight-card";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { freeReport } from "@/config/app";
import { reportFromLabel, reportRangeLabel, reportRateLabel, reportService, serviceLabels } from "@/config/services";

const cards = [
  {
    icon: FileCheck2,
    tag: <Badge tone="info">Automatic · a few minutes</Badge>,
    title: serviceLabels[reportService],
    body: "Paste your text and press Enter. Every sentence and paragraph is read, and you get an overall level, a map of your text, the sentences to look at again and grammar spots, with a PDF to download.",
    meta: `${freeReport.dailyLimit} free a day · ${reportFromLabel} · ${reportRateLabel} · ${reportRangeLabel}`,
    href: "/services/screening",
  },
];

export function CoreServices() {
  return (
    <section id="services" className="py-24 sm:py-32">
      <Container>
        <SectionHeading
          eyebrow="Our service"
          title="One service: the AI-writing risk report."
          body="An automatic AI-writing risk report on your own text. Your first report each day is free."
        />
        <Stagger className="mt-14 mx-auto grid max-w-xl gap-5">
          {cards.map((c) => (
            <StaggerItem key={c.title}>
              <SpotlightCard press className="h-full">
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
