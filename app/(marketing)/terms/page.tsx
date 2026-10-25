import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/ui/section";
import { brand } from "@/config/app";
import { disclaimers } from "@/config/services";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using 0%: our services, payments, refunds and acceptable use.",
  alternates: { canonical: "/terms" },
};

// Foundation text. Have it reviewed by a lawyer before launch.
export default function TermsPage() {
  return (
    <>
      <PageHeader eyebrow="Terms" title="Terms of service" />
      <Container className="prose-doc max-w-3xl">
        <h2>1. The service</h2>
        <p>{brand.name} provides (a) an AI-writing risk report, made automatically by this website from the text you submit (one a day is free, more are paid), and (b) paid Writing Refinement: clarity, flow and style refinement of your own writing.</p>
        <h2>2. Independence</h2>
        <p>{disclaimers.turnitin}</p>
        <h2>3. Your content</h2>
        <p>You must only submit work that you wrote yourself or are otherwise authorised to submit. You keep ownership of your work. You give us permission to store and process it only as needed to deliver the service you ordered.</p>
        <h2>4. Results</h2>
        <ul>
          <li>The report is written by an automated reviewer. Its ratings are guidance, can be wrong in both directions, and may differ if you run the same text again. It does not predict the result of Turnitin or any other detector.</li>
          <li>{disclaimers.noGuarantee} No automated indicator proves who wrote a text.</li>
        </ul>
        <h2>5. Writing Refinement</h2>
        <p>Writing Refinement improves clarity, flow and phrasing while preserving meaning, factual claims and citations. We will not invent sources or citations. We may decline requests that appear intended to disguise authorship.</p>
        <h2>6. Payment and refunds</h2>
        <p>Services are paid for with credits bought in US dollars; the price of every service is shown before you pay. If we cannot complete a paid order, its credits are returned. A new report after revision is a new order. Full details, including crypto, PayPal and Alipay payments, are in the <Link href="/refunds">refund policy</Link>.</p>
        <h2>7. Acceptable use</h2>
        <p>Do not use the service to misrepresent authorship, to submit others&rsquo; work without permission, or to attempt to access other users&rsquo; data.</p>
        <h2>8. Contact</h2>
        <p><a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a></p>
      </Container>
    </>
  );
}
