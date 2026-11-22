"use client";

import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";

const links = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/services", label: "Services" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
];

export function Navbar({ signedIn: verified }: { signedIn?: boolean }) {
  const [hasSession, setHasSession] = useState(false);
  const signedIn = verified ?? hasSession;
  useEffect(() => {
    if (
      verified !== undefined ||
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
      return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void import("@/lib/supabase/client")
      .then(({ createClient }) => {
        if (disposed) return;
        const { data } = createClient().auth.onAuthStateChange((_event, session) =>
          setHasSession(Boolean(session)),
        );
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch(() => {
        /* Public links remain usable if the session is unavailable. */
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [verified]);

  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const toggle = useRef<HTMLButtonElement>(null);
  function closeMenu() {
    setOpenOn(null);
  }
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenOn(null);
      toggle.current?.focus();
    }
    const desktop = window.matchMedia("(min-width: 860px)");
    function onSize() {
      if (desktop.matches) setOpenOn(null);
    }
    window.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onSize);
    return () => {
      window.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onSize);
    };
  }, [open]);

  const account = signedIn ? "/dashboard" : "/signup";
  const accountLabel = signedIn ? "Dashboard" : "Start free";
  return (
    <header className="studio-masthead">
      <nav className="studio-width studio-nav" aria-label="Main">
        <Logo />
        <ul className="nav-desktop">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} aria-current={pathname === link.href ? "page" : undefined}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="nav-account">
          {!signedIn && (
            <Link className="nav-login" href="/login">
              Log in
            </Link>
          )}
          <Link className="nav-cta" href={account}>
            {accountLabel} <ArrowUpRight size={14} aria-hidden />
          </Link>
          <button
            ref={toggle}
            type="button"
            className="nav-menu-toggle"
            aria-controls="mobile-menu"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpenOn(open ? null : pathname)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>
      {open && (
        <nav id="mobile-menu" aria-label="Mobile" className="nav-drawer">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              onClick={closeMenu}
            >
              {link.label}
              <ArrowUpRight size={17} aria-hidden />
            </Link>
          ))}
          {!signedIn && (
            <Link href="/login" onClick={closeMenu}>
              Log in <ArrowUpRight size={17} aria-hidden />
            </Link>
          )}
          <Link href={account} onClick={closeMenu}>
            {accountLabel} <ArrowUpRight size={17} aria-hidden />
          </Link>
        </nav>
      )}
    </header>
  );
}
