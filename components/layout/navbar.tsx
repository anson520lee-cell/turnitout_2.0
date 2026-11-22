"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { Logo } from "@/components/ui/logo";

const links = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/services", label: "Services" },
  { href: "/sample-report", label: "Sample report" },
  { href: "/pricing", label: "Pricing" },
];

export function Navbar({ signedIn: verified }: { signedIn?: boolean }) {
  const [hasSession, setHasSession] = useState(false);
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const open = menuPath === pathname;
  const signedIn = verified ?? hasSession;

  useEffect(() => {
    if (verified !== undefined || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void import("@/lib/supabase/client").then(({ createClient }) => {
      if (disposed) return;
      const { data } = createClient().auth.onAuthStateChange((_event, session) => {
        setHasSession(Boolean(session));
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => { /* Guest links remain available if auth cannot initialize. */ });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [verified]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuPath(null);
      toggle.current?.focus();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <header className="orb-nav">
      <nav className="orb-container orb-nav-inner" aria-label="Main">
        <Logo />
        <button
          ref={toggle}
          className="orb-menu-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="site-navigation"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setMenuPath(open ? null : pathname)}
        >
          {open ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
        <div className="orb-nav-panel" id="site-navigation" data-open={open || undefined}>
          <ul className="orb-nav-links">
            {links.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setMenuPath(null)}>{label}</Link>
              </li>
            ))}
          </ul>
          <div className="orb-nav-actions">
            {!signedIn && <Link className="orb-nav-login" href="/login" onClick={() => setMenuPath(null)}>Log in</Link>}
            <Link className="orb-button orb-button-secondary" href={signedIn ? "/dashboard" : "/signup"} onClick={() => setMenuPath(null)}>
              {signedIn ? "Dashboard" : "Start free"} <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
