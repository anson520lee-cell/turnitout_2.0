import { Container, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid, ScanText, FileStack, Settings, FileText } from "lucide-react";
import { NeuralStrip } from "@/components/space/neural-strip";

/** Static illustration of the dashboard. No real data. */
export function DashboardPreview() {
  const rows = [
    { t: "Sociology essay – final", s: "Screening", tone: "progress" as const },
    { t: "Lab report 3", s: "Completed", tone: "success" as const },
    { t: "Literature review", s: "Queued", tone: "info" as const },
  ];
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Your dashboard"
          title="Every scan and order in one place."
          body="Remaining free scans, live order status, and reports ready to open."
        />
        <Reveal className="mx-auto mt-14 max-w-5xl [perspective:1600px]">
          <div data-tilt="5" className="glass-strong overflow-hidden rounded-3xl [--rx0:7deg] [transform:perspective(1000px)_rotateX(7deg)]" aria-hidden>
            <div className="flex">
              <div className="hidden w-48 shrink-0 border-r border-[var(--line)] p-4 sm:block">
                <div className="h-5 w-24 rounded bg-white/10" />
                <div className="mt-6 space-y-1">
                  {[LayoutGrid, ScanText, FileStack, FileText, Settings].map((I, i) => (
                    <div key={i} className={`flex items-center gap-2 rounded-lg px-2 py-2 ${i === 0 ? "bg-white/[0.06]" : ""}`}>
                      <I className="size-4 text-fg-subtle" />
                      <div className="h-2 w-16 rounded bg-white/10" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-1 p-5 sm:p-7">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-[var(--line)] bg-ink-900/60 p-4">
                    <p className="text-[12px] text-fg-muted">Free scans today</p>
                    <p className="mt-2 text-2xl font-semibold">2 <span className="text-[14px] font-normal text-fg-subtle">of 3 left</span></p>
                    <div className="mt-3 flex gap-1.5">
                      <span className="h-1.5 flex-1 rounded-full bg-accent" />
                      <span className="h-1.5 flex-1 rounded-full bg-accent" />
                      <span className="h-1.5 flex-1 rounded-full bg-white/10" />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-ink-900/60 p-4">
                    <p className="text-[12px] text-fg-muted">Active orders</p>
                    <p className="mt-2 text-2xl font-semibold">2</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-ink-900/60 p-4">
                    <p className="text-[12px] text-fg-muted">Reports ready</p>
                    <p className="mt-2 text-2xl font-semibold">1</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-5 rounded-2xl border border-[var(--line)] bg-ink-900/60 p-4">
                  <div className="shrink-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">Pattern Engine · ready</p>
                    <p className="mt-1 text-[13px] text-fg-muted">Six signals in, one estimate out.</p>
                  </div>
                  <NeuralStrip className="ml-auto max-w-[340px]" />
                </div>
                <div className="mt-5 rounded-2xl border border-[var(--line)] bg-ink-900/40">
                  {rows.map((r) => (
                    <div key={r.t} className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3.5 last:border-0">
                      <span className="text-[13.5px]">{r.t}</span>
                      <Badge tone={r.tone} dot>{r.s}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
