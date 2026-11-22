import { Container, SectionHeading } from "@/components/ui/section";

const stages = [
  {
    label: "Paste your text",
    body: "Press Get report, paste your text and press Enter. One full report a day is free.",
  },
  {
    label: "Cut into sections",
    body: "Your text is split into sections so that every sentence gets read.",
  },
  {
    label: "Reading",
    body: "Every sentence and paragraph is read while you watch a live scan of your own text.",
  },
  { label: "Putting it together", body: "The sections are joined into one report with a PDF to download." },
  {
    label: "Report ready",
    body: "An overall level, a map of your text and the sentences to look at again, in a few minutes.",
  },
];

export function ScrollStory() {
  return (
    <section className="pb-24 sm:pb-32">
      <Container>
        <SectionHeading title="Inside the scan" />
        <ol className="mt-8 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
          {stages.map((s) => (
            <li key={s.label} className="border-t border-[var(--line-strong)] pt-4">
              <h3 className="text-[15px] font-medium">{s.label}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
