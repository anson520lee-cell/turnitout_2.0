import { ArrowUpRight } from "lucide-react";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { Logo } from "@/components/ui/logo";
import { brand } from "@/config/app";

const columns = [
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
    title: "Support",
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
    <footer className="orb-footer">
      <div className="orb-container">
        <div className="orb-footer-grid">
          <div className="orb-footer-brand">
            <Logo />
            <p>{brand.tagline}</p>
          </div>
          {columns.map(({ title, links }) => (
            <div key={title}>
              <h2 className="orb-label">{title}</h2>
              <ul>
                {links.map(({ href, label }) => (
                  <li key={href}><Link href={href}>{label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="orb-footer-end">
          <p>© {new Date().getFullYear()} {brand.operator}</p>
          <Link href="/services/screening">Get a report <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
      </div>
    </footer>
  );
}
