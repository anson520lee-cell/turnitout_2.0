import { Container, SectionHeading } from "@/components/ui/section";
import { Build, Stagger } from "@/components/motion/reveal";
import { Lock, KeyRound, Timer, UserCheck, FileX2, ScrollText } from "lucide-react";
import { retentionSentence } from "@/config/privacy-copy";

const items = [
  { icon: Lock, title: "Private storage", body: "Documents and reports sit in private buckets with no public URLs." },
  { icon: KeyRound, title: "Short-lived links", body: "Files open through signed links that expire after 60 seconds." },
  { icon: UserCheck, title: "Strict access", body: "Only you and authorised staff can reach your files, enforced in the database itself." },
  { icon: FileX2, title: "No paper database", body: "Your text is never sent to Turnitin or added to any paper repository, so it can't match against you later." },
  { icon: Timer, title: "Scheduled deletion", body: retentionSentence.source },
  { icon: ScrollText, title: "Audit trail", body: "Every status change and file access is recorded against the order." },
];

/**
 * The privacy controls as a spec sheet ruled in hairlines: each cell is traced
 * as an outline and filled as it scrolls in, its line icon drawing last. On
 * hover a cell answers in the site's three beats: its top edge draws in, the
 * content rises, the light comes last.
 */
export function PrivacySection() {
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <SectionHeading
          eyebrow="Privacy & security"
          title="Unpublished work,"
          outline="handled like it matters."
          body="Privacy is part of the product. These are the controls that exist today."
        />
        <Stagger className="spec-grid mt-14">
          {items.map((it, i) => (
            <Build key={it.title} r={0}>
              <div className="spec-cell">
                <div className="spec-in">
                  <div className="flex items-center justify-between">
                    <span className="nav-idx">{String(i + 1).padStart(2, "0")}</span>
                    <it.icon className="size-5 text-accent" aria-hidden strokeWidth={1.5} />
                  </div>
                  <h3 className="mt-8 text-[16px] font-semibold tracking-tight">{it.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-fg-muted">{it.body}</p>
                </div>
              </div>
            </Build>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
