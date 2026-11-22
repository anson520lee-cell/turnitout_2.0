import { ArrowRight, ArrowUpRight, ShieldCheck } from "lucide-react";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { buttonClasses } from "@/components/ui/button";
import { freeReport } from "@/config/app";
import { OrbitalStudy } from "./orbital-study";

export function Hero() {
  return (
    <section className="field-hero" aria-labelledby="hero-title">
      <div className="field-wash" aria-hidden />
      <div className="studio-width">
        <div className="field-composition">
          <div className="field-copy">
            <span className="field-ruler" aria-hidden />
            <h1 id="hero-title">
              Know before
              <br />
              <em>you submit.</em>
            </h1>
            <p className="field-lead">
              Get a report that reads every sentence and shows where your writing could be misread as
              AI-written. Your first one each day is free.
            </p>
            <div className="field-actions">
              <Link href="/services/screening" className={buttonClasses("primary", "lg")}>
                Get report <ArrowUpRight size={17} aria-hidden />
              </Link>
              <Link href="/sample-report" className="studio-text-link">
                See a sample report <ArrowRight size={15} aria-hidden />
              </Link>
            </div>
          </div>
          <OrbitalStudy />
        </div>
        <div className="field-controls">
          <p className="field-note">
            <ShieldCheck size={16} aria-hidden />
            {freeReport.dailyLimit} full report free every day. Private document handling.
          </p>
          <a className="field-jump" href="#how-it-works" aria-label="How it works">
            <ArrowRight size={15} aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
