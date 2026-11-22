import { ArrowUpRight, FileText, ScanLine, SquarePen } from "lucide-react";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { freeReport } from "@/config/app";
import { reportFromLabel, reportRateLabel } from "@/config/services";

const steps = [
  { icon: FileText, title: "Paste your draft", body: "Add your text or import a document. See its character count and price before you submit." },
  { icon: ScanLine, title: "Read the signals", body: "Watch the scan, then find flagged paragraphs and see what stood out in each sentence." },
  { icon: SquarePen, title: "Revise with context", body: "Review optional Writing Refinement suggestions and decide what fits your draft." },
];

export function ReportSteps() {
  return (
    <ol className="orb-process">
      {steps.map(({ icon: Icon, title, body }, index) => (
        <li key={title}>
          <div className="orb-process-marker"><span>0{index + 1}</span><Icon size={23} strokeWidth={1.4} aria-hidden="true" /></div>
          <h3>{title}</h3>
          <p>{body}</p>
        </li>
      ))}
    </ol>
  );
}

export function ReportOffers({ pricingPage = false }: { pricingPage?: boolean }) {
  const Heading = pricingPage ? "h2" : "h3";
  return (
    <div className="orb-price-grid">
      <article>
        <p className="orb-label">Daily report</p>
        <Heading>Free</Heading>
        <p>Up to {freeReport.maxChars.toLocaleString("en-HK")} characters</p>
        <Link className="orb-inline-link" href="/services/screening#daily-free-report">Get today’s report <ArrowUpRight size={17} aria-hidden="true" /></Link>
      </article>
      <article>
        <p className="orb-label">Pay per report</p>
        <Heading>{reportFromLabel}</Heading>
        <p>{reportRateLabel}</p>
        <Link className="orb-inline-link" href={pricingPage ? "/services/screening#paid-report" : "/pricing"}>
          {pricingPage ? "Get a report" : "View pricing"} <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </article>
    </div>
  );
}
