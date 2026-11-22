import { Container, SectionHeading } from "@/components/ui/section";
import { Stagger, StaggerItem } from "@/components/motion/reveal";

const reasons = [
  {
    title: "Formal academic register",
    body: "Academic conventions reward consistent structure and signposting, which is also what detectors look for.",
  },
  {
    title: "Second-language writing",
    body: "Writers working in a second language often favour safer, more predictable phrasing and a narrower vocabulary.",
  },
  {
    title: "Templates and rubrics",
    body: "Following a required structure paragraph by paragraph produces the even, repeated shape detectors weigh.",
  },
  {
    title: "Heavy editing tools",
    body: "Grammar and style tools can smooth out the natural variation in a draft.",
  },
];

export function FalsePositives() {
  return (
    <section className="py-24 sm:py-32">
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <SectionHeading
          eyebrow="False positives"
          title="Why genuine writing can still be flagged."
          body="Automated AI-writing indicators measure how predictable a text is. Plenty of honest writing is predictable. An indicator is a signal to read carefully, not proof of who wrote something."
        />
        <Stagger className="grid gap-4 sm:grid-cols-2">
          {reasons.map((r, i) => (
            <StaggerItem key={r.title} tilt className="glass rounded-2xl p-6">
              <span className="font-mono text-[11px] text-fg-subtle">0{i + 1}</span>
              <h3 className="mt-3 text-[15.5px] font-semibold tracking-tight">{r.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-fg-muted">{r.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
