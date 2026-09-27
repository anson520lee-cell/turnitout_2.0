import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/ui/section";
import { brand } from "@/config/app";
import { disclaimers } from "@/config/services";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="Built for students checking their own work."
        body={`${brand.name} is an independent service for students who want to know how their genuine writing reads before they hand it in.`}
      />
      <Container className="prose-doc max-w-3xl">
        <h2>What we do</h2>
        <p>
          We offer three things: a free preliminary scan that measures writing patterns, a paid AI &amp; similarity report where a
          person on our team runs your text through a Turnitin screening workflow and delivers what it returned, and
          Writing Refinement: clarity, flow and style refinement of your own writing.
        </p>
        <h2>What we don&rsquo;t do</h2>
        <ul>
          <li>We don&rsquo;t claim any indicator proves who wrote a text.</li>
          <li>We don&rsquo;t guarantee scores or outcomes.</li>
          <li>We don&rsquo;t help disguise AI-generated or third-party work.</li>
          <li>We don&rsquo;t present our own scan as a Turnitin result.</li>
        </ul>
        <h2>Independence</h2>
        <p>{disclaimers.turnitin}</p>
        <h2>Contact</h2>
        <p>
          <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>
        </p>
      </Container>
    </>
  );
}
