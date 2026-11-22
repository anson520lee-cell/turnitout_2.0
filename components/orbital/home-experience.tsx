import { preload } from "react-dom";
import { ArrowDown, ArrowUpRight, ShieldCheck } from "lucide-react";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { faq } from "@/config/faq";
import { HeroScene } from "./hero-scene";
import { ReportExplorer } from "./report-explorer";
import { ReportOffers, ReportSteps } from "./report-journey";
import { FaqList } from "@/components/landing/faq-list";

const homeQuestions = new Set([
  "What does the report include?",
  "What is the daily free report?",
  "Can AI-writing detectors make mistakes?",
  "What happens to my text after the report?",
  "What is Writing Refinement?",
]);

export function HomeExperience() {
  preload("/orbital/field.webp", { as: "image", fetchPriority: "high" });
  return (
    <>
      <HeroScene>
        <div className="orb-container orb-hero-inner">
          <div className="orb-hero-copy">
            <p className="orb-label orb-hero-kicker"><span className="orb-indicator" /> AI-writing risk reports</p>
            <h1 id="home-title">Read between<br />the <em>lines.</em></h1>
            <p className="orb-hero-lead">See which sentences could be read as AI-written, understand why, and decide what you want to revise before you submit.</p>
            <div className="orb-hero-actions">
              <Link className="orb-button orb-button-primary" href="/services/screening">
                Get a free report <ArrowUpRight size={20} aria-hidden="true" />
              </Link>
              <Link className="orb-button orb-button-secondary" href="/sample-report">
                View sample report <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="orb-hero-rail">
            <a href="#report-preview"><ArrowDown size={17} aria-hidden="true" /> Explore the report</a>
            <span className="orb-hero-rail-detail"><span className="orb-indicator" /> One free report every day</span>
            <Link href="/privacy"><ShieldCheck size={17} aria-hidden="true" /> Private document handling</Link>
          </div>
        </div>
      </HeroScene>

      <section className="orb-container orb-section orb-report-section" id="report-preview">
        <div className="orb-section-intro">
          <p className="orb-label">Inside the report</p>
          <h2>See what was flagged.<br /><em>Understand why.</em></h2>
          <p>A paragraph map shows where to look. Sentence notes explain what stands out. Writing Refinement lets you try a different way to say it.</p>
        </div>
        <ReportExplorer />
      </section>

      <section className="orb-container orb-section" id="workflow">
        <div className="orb-section-intro">
          <p className="orb-label">How it works</p>
          <h2>From draft to<br /><em>next steps.</em></h2>
        </div>
        <ReportSteps />
        <Link className="orb-inline-link" href="/how-it-works">See the full process <ArrowUpRight size={17} aria-hidden="true" /></Link>
      </section>

      <section className="orb-container orb-section" id="pricing">
        <div className="orb-section-intro">
          <p className="orb-label">Pricing</p>
          <h2>Start <em>free.</em></h2>
          <p>Every account gets a full report each day. For longer drafts and additional reports, the price is based on length.</p>
        </div>
        <ReportOffers />
      </section>

      <section className="orb-container orb-section orb-faq-section" id="questions">
        <div className="orb-section-intro">
          <p className="orb-label">Common questions</p>
          <h2>Before you<br /><em>submit.</em></h2>
          <Link className="orb-inline-link" href="/faq">See all answers <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </div>
        <FaqList items={faq.filter(({ q }) => homeQuestions.has(q))} />
      </section>

      <section className="orb-end">
        <div className="orb-container orb-end-inner">
          <div>
            <p className="orb-label">One free report daily</p>
            <h2>Ready to read<br /><em>your draft?</em></h2>
          </div>
          <Link className="orb-button orb-button-primary" href="/services/screening">
            Get a free report <ArrowUpRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
