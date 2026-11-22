import type { ReactNode } from "react";
import { Container } from "@/components/ui/section";
import { DocIndex } from "@/components/layout/doc-index";

/**
 * Body of a long-form page (policies, about): its sections are numbered on
 * hairlines that draw in as they arrive, and on wide screens an index rail
 * beside the text shows where you are and takes you to any section.
 */
export function ProseDoc({ children }: { children: ReactNode }) {
  return (
    <Container className="doc-layout">
      <DocIndex />
      <div className="prose-doc">{children}</div>
    </Container>
  );
}
