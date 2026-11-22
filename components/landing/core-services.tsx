import { ArrowUpRight } from "lucide-react";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { Container } from "@/components/ui/section";
import { freeReport } from "@/config/app";
import { reportFromLabel, reportRangeLabel, reportRateLabel } from "@/config/services";
import { rewritePricing } from "@/config/pricing";

export function CoreServices() {
  return (
    <section id="services">
      <Container className="service-route">
        <article>
          <p className="orbit-kicker">
            <i aria-hidden />
            Automatic report
          </p>
          <h2>Read your draft.</h2>
          <p>
            Paste your text and press Enter. Every sentence and paragraph is read. Get an overall level, a map of
            your text, the sentences to look at again and grammar spots, with a PDF to download.
          </p>
          <p className="service-spec">
            {freeReport.dailyLimit} free a day · {reportFromLabel} · {reportRateLabel} · {reportRangeLabel}
          </p>
          <Link href="/services/screening" className="orbit-text-link">
            Get a report <ArrowUpRight size={15} />
          </Link>
        </article>
        <article>
          <p className="orbit-kicker">
            <i aria-hidden />
            Optional add-on
          </p>
          <h2>Writing Refinement.</h2>
          <p>
            After a report is finished, you can ask for a rewrite of each flagged sentence. The result is re-checked
            by the same detector and what still reads as AI is rewritten again. A suggestion may change what a
            sentence says. Numbers, names, quotations and citations are kept. You choose which suggestions to use.
          </p>
          <p className="service-spec">
            {rewritePricing.multiple}× the report price. Charged only when suggestions are ready. It does not
            guarantee any result in any checker.
          </p>
          <div className="flex flex-wrap gap-5">
            <Link href="/sample-report#writing-refinement" className="orbit-text-link">
              Try the example <ArrowUpRight size={15} />
            </Link>
            <Link href="/pricing" className="orbit-text-link">
              Pricing <ArrowUpRight size={15} />
            </Link>
          </div>
        </article>
      </Container>
    </section>
  );
}
