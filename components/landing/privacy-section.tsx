import { Container, SectionHeading } from "@/components/ui/section";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { Lock, KeyRound, Timer, UserCheck, FileX2, ScrollText } from "lucide-react";
import { retention } from "@/config/app";

const items = [
  { icon: Lock, title: "Private storage", body: "Documents and reports sit in private buckets with no public URLs." },
  { icon: KeyRound, title: "Short-lived links", body: "Files open through signed links that expire after 60 seconds." },
  { icon: UserCheck, title: "Strict access", body: "Only you and authorised staff can reach your files, enforced in the database itself." },
  { icon: FileX2, title: "No repository storage", body: "Screenings are run with repository storage switched off, so your paper isn't kept for later matching." },
  { icon: Timer, title: "Scheduled deletion", body: `Source documents are deleted ${retention.sourceDocumentDays} days after your order completes.` },
  { icon: ScrollText, title: "Audit trail", body: "Every status change and file access is recorded against the order." },
];

export function PrivacySection() {
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <SectionHeading
          eyebrow="Privacy & security"
          title="Unpublished work, handled like it matters."
          body="Privacy is part of the product. These are the controls that exist today."
        />
        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <StaggerItem key={it.title} tilt className="glass rounded-2xl p-6">
              <it.icon className="size-5 text-accent" aria-hidden />
              <h3 className="mt-4 text-[15px] font-semibold">{it.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted">{it.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
