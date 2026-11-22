"use client";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/services", label: "Services" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
];

export function Navbar({ signedIn: verified }: { signedIn?: boolean }) {
  const [hasSession, setHasSession] = useState(false);
  const signedIn = verified ?? hasSession;
  useEffect(() => {
    // Public pages share static HTML. Only the account shortcut needs session state.
    if (verified !== undefined || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void import("@/lib/supabase/client").then(({ createClient }) => {
      if (disposed) return;
      const { data } = createClient().auth.onAuthStateChange((_event, session) => {
        setHasSession(Boolean(session));
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => { /* Guest navigation stays usable if auth cannot initialise. */ });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [verified]);

  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  // Menu state is tied to the path it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenOn(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <nav
        aria-label="Main"
        className={cn(
          "nav-bar mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl px-4 transition-all duration-500 sm:px-5",
          scrolled || open ? "glass-strong" : "border border-transparent",
        )}
      >
        <Logo />
        <ul className="hidden items-center gap-0.5 md:flex">
          {links.map((l, i) => (
            <li key={l.href}>
              <Link
                href={l.href}
                data-active={pathname === l.href || undefined}
                aria-current={pathname === l.href ? "page" : undefined}
                className="nav-link"
              >
                <span className="nav-idx" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="nav-label">{l.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <Link href="/dashboard" className={buttonClasses("primary", "sm", "px-4")}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="nav-link">
                <span className="nav-label">Log in</span>
              </Link>
              <Link href="/signup" className={buttonClasses("primary", "sm", "px-4")}>
                Start free
                <ArrowRight className="size-3.5 transition-transform group-hover/btn:translate-x-0.5" />
              </Link>
            </>
          )}
        </div>
        <button
          type="button"
          className="nav-burger grid size-11 place-items-center rounded-lg text-fg-muted hover:text-fg md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          data-open={open || undefined}
          onClick={() => setOpenOn(open ? null : pathname)}
        >
          <span aria-hidden className="nav-burger-lines">
            <i />
            <i />
          </span>
        </button>
      </nav>
      {open && (
        <div id="mobile-menu" className="nav-sheet glass-strong mx-auto mt-2 max-w-6xl rounded-2xl md:hidden">
          <ul>
            {links.map((l, i) => (
              <li key={l.href} style={{ "--i": i } as CSSProperties}>
                <Link href={l.href} data-press aria-current={pathname === l.href ? "page" : undefined} className="nav-sheet-link">
                  <span className="nav-idx" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="nav-sheet-label">{l.label}</span>
                  <ArrowUpRight className="ml-auto size-4 text-fg-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <div className="nav-sheet-cta grid grid-cols-2 gap-2 p-3" style={{ "--i": links.length } as CSSProperties}>
            {signedIn ? (
              <Link href="/dashboard" className={buttonClasses("primary", "md", "col-span-2")}>
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className={buttonClasses("secondary", "md")}>
                  Log in
                </Link>
                <Link href="/signup" className={buttonClasses("primary", "md")}>
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
