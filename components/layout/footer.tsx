import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Container } from "@/components/ui/section";
import { brand } from "@/config/app";
import { disclaimers } from "@/config/services";

const cols = [
  {
    title: "Product",
    links: [
      { href: "/scan", label: "Free scan" },
      { href: "/services", label: "Services" },
      { href: "/pricing", label: "Pricing" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/faq", label: "FAQ" },
      { href: `mailto:${brand.supportEmail}`, label: "Contact" },
    ],
  },
  {
    title: "Policies",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/academic-integrity", label: "Academic integrity" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-[var(--line)] bg-ink-950">
      <Container className="grid gap-12 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-[13.5px] leading-relaxed text-fg-muted">{brand.description}</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h2 className="text-[12px] font-medium uppercase tracking-[0.16em] text-fg-subtle">{c.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-[13.5px] text-fg-muted transition hover:text-fg">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <Container className="border-t border-[var(--line)] py-6">
        <p className="text-[12px] leading-relaxed text-fg-subtle">{disclaimers.turnitin}</p>
        <p className="mt-2 text-[12px] text-fg-subtle">
          © {new Date().getFullYear()} {brand.operator}. {disclaimers.noGuarantee}
        </p>
      </Container>
    </footer>
  );
}
