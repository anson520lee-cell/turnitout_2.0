import type { ReactNode } from "react";
import { Container } from "@/components/ui/section";

export function PageHeader({ eyebrow, title, body }: { eyebrow: string; title: ReactNode; body?: ReactNode }) {
  return (
    <header className="orb-page-heading">
      <Container className="relative">
        <p className="orb-label"><span className="orb-indicator" /> {eyebrow}</p>
        <h1>{title}</h1>
        {body && <p className="orb-page-lead">{body}</p>}
      </Container>
    </header>
  );
}
