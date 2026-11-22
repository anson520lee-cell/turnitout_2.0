import { ArrowRight, ShieldCheck } from "lucide-react";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/section";
import { freeReport } from "@/config/app";
import { HeroVisual } from "./hero-visual";
import styles from "./writing-atlas.module.css";

export function Hero() {
  return (
    <section className={styles.hero}>
      <Container className="relative grid items-center gap-10 lg:grid-cols-[.88fr_1.12fr] lg:gap-6">
        <div>
          <p className={styles.kicker}><span /> AI-writing risk report</p>
          <h1 data-no-entrance className={styles.headline}>Know before<br /><em>you submit.</em></h1>
          <p className="mt-7 max-w-md text-pretty text-[16px] leading-relaxed text-fg-muted">
            Get a report that reads every sentence and shows where your writing could be misread as
            AI-written. Your first one each day is free.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/services/screening" className={buttonClasses("primary", "lg")}>
              Get report <ArrowRight className="size-4" />
            </Link>
            <Link href="/sample-report" className={buttonClasses("secondary", "lg")}>See a sample report</Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-[12px] text-fg-subtle">
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            {freeReport.dailyLimit} full report free every day. Private document handling.
          </p>
        </div>
        <HeroVisual />
      </Container>
    </section>
  );
}
