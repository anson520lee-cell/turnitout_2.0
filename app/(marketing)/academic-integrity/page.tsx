import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/ui/section";

export const metadata: Metadata = {
  title: "Academic integrity",
  description: "Our academic integrity policy: we check and polish your own writing, and never disguise authorship or AI-generated text.",
  alternates: { canonical: "/academic-integrity" },
};

export default function IntegrityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Academic integrity"
        title="For genuine student writing."
        body="We support students reviewing and refining work they have genuinely written. The service is not intended to disguise third-party or AI-generated academic work as original authorship."
      />
      <Container className="prose-doc max-w-3xl">
        <h2>What we ask of you</h2>
        <ul>
          <li>Submit only work you wrote yourself, or that you are otherwise authorised to submit.</li>
          <li>Follow your institution&rsquo;s rules on proofreading, editing help and pre-submission checks.</li>
          <li>You confirm this each time you place an order.</li>
        </ul>
        <h2>How we position the report</h2>
        <ul>
          <li><strong>Report:</strong> guidance from an automated reviewer at one point in time, useful for understanding false-positive risk. It is not evidence of authorship and not a judgement about you.</li>
        </ul>
        <h2>What we won&rsquo;t do</h2>
        <ul>
          <li>Rewrite AI-generated or third-party work so it passes as yours.</li>
          <li>Invent or alter sources and citations.</li>
          <li>Promise a particular score.</li>
        </ul>
      </Container>
    </>
  );
}
