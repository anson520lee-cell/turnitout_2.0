import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { Logo } from "@/components/ui/logo";
import { Container } from "@/components/ui/section";
import { brand } from "@/config/app";
import { FooterWordmark } from "@/components/layout/footer-wordmark";

const cols = [
  {
    title: "Product",
    links: [
      { href: "/services", label: "Services" },
      { href: "/pricing", label: "Pricing" },
      { href: "/sample-report", label: "Sample report" },
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
      { href: "/refunds", label: "Refunds" },
      { href: "/academic-integrity", label: "Academic integrity" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="site-footer relative mt-24 overflow-hidden bg-ink-950/70">
      <Container className="grid grid-cols-2 gap-x-6 gap-y-10 py-12 sm:py-14 md:grid-cols-[1.4fr_repeat(3,1fr)] md:gap-12">
        <div className="col-span-2 max-w-xs md:col-span-1">
          <Logo />
          <p className="mt-4 text-[13.5px] leading-relaxed text-fg-muted">{brand.description}</p>
        </div>
        {cols.map((c, i) => (
          <div key={c.title}>
            <h2 className="footer-col-title">
              <span aria-hidden className="nav-idx">{String(i + 1).padStart(2, "0")}</span>
              {c.title}
            </h2>
            <ul className="mt-3 space-y-0.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="link-line inline-block py-2 text-[13.5px] text-fg-muted md:py-1.5">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <FooterWordmark />
      <Container className="relative border-t border-[var(--line)] py-6">
        <p className="text-[12px] text-fg-subtle">© {new Date().getFullYear()} {brand.operator}.</p>
      </Container>
    </footer>
  );
}
