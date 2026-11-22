import { ArrowRight } from "lucide-react";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { Container } from "@/components/ui/section";
import { Headline } from "@/components/ui/headline";
import { Reveal } from "@/components/motion/reveal";

/** The integrity statement, set large between hairline corner marks instead of in a box. */
export function IntegritySection() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div className="integrity relative mx-auto max-w-4xl px-2 py-10 sm:px-10 sm:py-14">
          <span aria-hidden className="integrity-corners" />
          <Reveal className="section-eyebrow">
            <span>Academic integrity</span>
          </Reveal>
          <Headline
            size="statement"
            solid="We support students reviewing and refining work they have genuinely written."
            className="mt-6"
          />
          <Reveal className="mt-5 max-w-3xl text-pretty text-[17px] leading-relaxed text-fg-muted sm:text-[19px]">
            The service is not intended to disguise third-party or AI-generated work as original authorship.
          </Reveal>
          <Reveal className="mt-8">
            <Link href="/academic-integrity" className="link-line inline-flex items-center gap-2 py-1 text-[14px] text-accent">
              Read our academic integrity policy
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
