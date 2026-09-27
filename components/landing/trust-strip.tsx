import { Container } from "@/components/ui/section";
import { Lock, EyeOff, Link2Off, Layers, Building2 } from "lucide-react";

const items = [
  { icon: Lock, label: "Private document storage" },
  { icon: Link2Off, label: "No public document URLs" },
  { icon: EyeOff, label: "Not stored in any repository" },
  { icon: Layers, label: "Clear result distinction" },
  { icon: Building2, label: "Independently operated" },
];

export function TrustStrip() {
  return (
    <section aria-label="Trust" data-cursor className="trust-strip relative border-y border-[var(--line)] bg-ink-900/40">
      <Container className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 py-6">
        {items.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-[13px] text-fg-muted">
            <Icon className="size-4 text-accent" aria-hidden />
            {label}
          </div>
        ))}
      </Container>
    </section>
  );
}
