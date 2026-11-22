import { ArrowDown, ArrowRight, ShieldCheck } from "lucide-react";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/section";
import { freeReport } from "@/config/app";
import { HeroVisual } from "./hero-visual";

export function Hero() {
  return (
    <section className="mission-hero">
      <Container className="mission-hero-grid">
        <div className="mission-copy">
          <p className="orbit-kicker">
            <i aria-hidden /> AI-writing risk report
          </p>
          <h1 data-no-entrance>
            Know before
            <br />
            <span>you submit.</span>
          </h1>
          <p className="mission-lead">
            Get a report that reads every sentence and shows where your writing could be misread as AI-written. Your
            first one each day is free.
          </p>
          <div className="mission-actions">
            <Link href="/services/screening" className={buttonClasses("primary", "lg")}>
              Get report <ArrowRight size={16} />
            </Link>
            <Link href="/sample-report" className={buttonClasses("secondary", "lg")}>
              See a sample report
            </Link>
          </div>
          <p className="mission-privacy">
            <ShieldCheck size={15} aria-hidden />
            {freeReport.dailyLimit} full report free every day. Private document handling.
          </p>
        </div>
        <HeroVisual />
      </Container>
      <Container>
        <div className="mission-baseline">
          <a href="#how-it-works">
            <ArrowDown size={13} aria-hidden /> How it works
          </a>
          <span aria-hidden />
        </div>
      </Container>
    </section>
  );
}
