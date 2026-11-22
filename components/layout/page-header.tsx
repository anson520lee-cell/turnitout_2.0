import type { ReactNode } from "react";
import { Container, Eyebrow } from "@/components/ui/section";

export function PageHeader({ eyebrow, title, body }: { eyebrow: string; title: ReactNode; body?: ReactNode }) {
  return (
    <header className="studio-page-head">
      <Container className="relative">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1>{title}</h1>
        {body && <p className="page-intro">{body}</p>}
      </Container>
    </header>
  );
}
