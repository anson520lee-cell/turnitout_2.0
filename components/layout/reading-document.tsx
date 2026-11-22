import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { Container } from "@/components/ui/section";
import { ReadingIndex } from "./reading-index";

/** Derive the rail from the document's real headings so policy edits cannot leave stale links. */
export function ReadingDocument({ children }: { children: ReactNode }) {
  const headings: { id: string; title: string }[] = [];
  const content = Children.map(children, (node) => {
    if (!isValidElement<{ id?: string; children?: ReactNode }>(node) || node.type !== "h2") return node;
    if (typeof node.props.children !== "string") return node;
    const title = node.props.children;
    const id = node.props.id ?? `section-${headings.length + 1}`;
    headings.push({ id, title });
    return cloneElement(node, { id });
  });
  return (
    <Container className="reading-document">
      <ReadingIndex headings={headings} />
      <article className="prose-doc">{content}</article>
    </Container>
  );
}
