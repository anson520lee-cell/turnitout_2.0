import type { ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { Container } from "@/components/ui/section";
import { OrbitCanvas } from "@/components/space/orbit-canvas";
import type { OrbitForm } from "@/components/space/orbit-renderer";

interface Props {
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  form?: OrbitForm;
  jump?: string;
}

export function PageHeader({ eyebrow, title, body, form = "draft", jump = "Read more" }: Props) {
  return (
    <section className="orbit-masthead">
      <Container>
        <div className="orbit-mast-grid">
          <div>
            <p className="orbit-kicker">
              <i aria-hidden />
              {eyebrow}
            </p>
            <h1>{title}</h1>
            {body && <p className="orbit-mast-body">{body}</p>}
          </div>
          <a className="orbit-mast-chart" href="#page-content" aria-label={jump}>
            <OrbitCanvas form={form} compact />
            <span className="orbit-mast-jump">
              <i aria-hidden />
              {jump}
              <ArrowDown size={13} aria-hidden />
            </span>
          </a>
        </div>
        <div id="page-content" className="orbit-datum" />
      </Container>
    </section>
  );
}
