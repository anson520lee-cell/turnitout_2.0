import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { ArrowRight, FileCheck2 } from "lucide-react";
import { Container, SectionHeading } from "@/components/ui/section";
import { Build } from "@/components/motion/reveal";
import { freeReport } from "@/config/app";
import { reportFromLabel, reportRangeLabel, reportRateLabel, reportService, serviceLabels } from "@/config/services";

const specs = [
  { k: "Free", v: `${freeReport.dailyLimit} report a day, up to ${freeReport.maxChars.toLocaleString("en-HK")} characters` },
  { k: "Price", v: `${reportFromLabel}, ${reportRateLabel.charAt(0).toLowerCase()}${reportRateLabel.slice(1)}` },
  { k: "Length", v: reportRangeLabel },
  { k: "Ready", v: "In a few minutes, while you watch a live scan" },
];

/**
 * The one service, as one object: a card that builds in as a 1px outline,
 * with its facts on hairline rows. The whole card is the link to the report
 * form; it lifts in three beats on hover and sinks when pressed.
 */
export function CoreServices() {
  return (
    <section id="services" className="py-24 sm:py-32">
      <Container>
        <SectionHeading
          eyebrow="Our service"
          title="One service:"
          outline="the AI-writing risk report."
          body="An automatic AI-writing risk report on your own text. Your first report each day is free."
        />
        <Build r={24} className="mx-auto mt-14 max-w-5xl">
          <Link href="/services/screening" data-tilt="" data-press className="svc glass-strong group rounded-[24px]">
            <div className="svc-main">
              <div className="flex items-center justify-between gap-3">
                <span className="svc-icon">
                  <FileCheck2 className="size-5" strokeWidth={1.5} aria-hidden />
                </span>
                <span className="svc-tag">Automatic · a few minutes</span>
              </div>
              <h3 className="mt-7 text-[22px] font-semibold tracking-tight sm:text-[26px]">{serviceLabels[reportService]}</h3>
              <p className="mt-3 text-[14.5px] leading-relaxed text-fg-muted">
                Paste your text and press Enter. Every sentence and paragraph is read, and you get an overall level, a map of your text, the sentences to look at again and grammar
                spots, with a PDF to download.
              </p>
              <span className="svc-go">
                Get report
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </div>
            <dl className="svc-specs">
              {specs.map((s, i) => (
                <div key={s.k} className="svc-spec">
                  <dt>
                    <span className="nav-idx">{String(i + 1).padStart(2, "0")}</span>
                    {s.k}
                  </dt>
                  <dd>{s.v}</dd>
                </div>
              ))}
            </dl>
          </Link>
        </Build>
      </Container>
    </section>
  );
}
