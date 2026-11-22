"use client";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { LayoutGrid, FileStack, FileCheck2, Settings, Wallet, Shield, LogOut } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { signOut } from "@/app/actions/account";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/orders", label: "Orders", icon: FileStack },
  { href: "/services/screening", label: "Get Report", icon: FileCheck2 },
  { href: "/billing", label: "Billing & Credits", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
];

// The design preview (/preview/app) shows the same shell with made-up data; its links stay inside the preview.
const previewHref: Record<string, string> = {
  "/dashboard": "/preview/app",
  "/orders": "/preview/app/orders",
  "/billing": "/preview/app/billing",
  "/settings": "/preview/app/settings",
};

const n2 = (i: number) => String(i + 1).padStart(2, "0");

/**
 * The signed-in shell, in the public site's voice: a column ruled off by one
 * hairline, the pages as an indexed list, and a 1px marker that slides to the
 * page you are on. On phones, a bar with the credit balance and a two-line
 * menu button that opens the same list as a sheet.
 */
export function AppSidebar({ email, isAdmin, credits, preview }: { email: string; isAdmin: boolean; credits: number; preview?: boolean }) {
  const path = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  // the sheet closes by itself when the page changes
  const open = openOn === path;
  const items = isAdmin ? [...nav, { href: "/admin", label: "Admin", icon: Shield }] : nav;
  const to = (href: string) => (preview ? previewHref[href] ?? href : href);
  // The longest matching item wins.
  const matches = (h: string) => path === h || (h !== "/dashboard" && h !== "/preview/app" && path.startsWith(`${h}/`));
  const activeIdx = items.findIndex(({ href }) => {
    const h = to(href);
    return matches(h) && !items.some((o) => to(o.href).length > h.length && matches(to(o.href)));
  });
  const n = credits.toLocaleString("en-US");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenOn(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const list = (sheet: boolean) => (
    <nav aria-label="App" className={cn("app-nav", sheet && "app-nav-sheet")}>
      <div className="app-nav-track" style={{ "--ai": activeIdx } as CSSProperties} data-active={activeIdx >= 0 || undefined}>
        <span aria-hidden className="app-nav-marker" />
        <ul>
          {items.map(({ href, label, icon: Icon }, i) => (
            <li key={href} style={{ "--i": i } as CSSProperties}>
              <Link
                href={to(href)}
                // The sheet stays up, with the pressed page lit, until that page arrives (it closes when the path changes).
                onClick={() => i === activeIdx && setOpenOn(null)}
                aria-current={i === activeIdx ? "page" : undefined}
                data-press
                className="app-nav-link"
              >
                <span className="nav-idx">{n2(i)}</span>
                <Icon className="app-nav-icon" strokeWidth={1.5} aria-hidden />
                <span className="app-nav-label">{label}</span>
                {href === "/billing" && <span className="app-nav-credits">{n}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="app-nav-foot">
        <p className="app-nav-email" title={email}>
          {email}
        </p>
        {preview ? (
          <button type="button" className="app-nav-link app-nav-out" aria-disabled title="Not available in the preview">
            <LogOut className="app-nav-icon" strokeWidth={1.5} aria-hidden /> <span className="app-nav-label">Log out</span>
          </button>
        ) : (
          <form action={signOut}>
            <button className="app-nav-link app-nav-out">
              <LogOut className="app-nav-icon" strokeWidth={1.5} aria-hidden /> <span className="app-nav-label">Log out</span>
            </button>
          </form>
        )}
      </div>
    </nav>
  );

  return (
    <>
      <aside className="app-side">
        <div className="app-rail">
          <div className="px-2">
            <Logo />
            <p className="app-rail-label">
              <span>Workspace</span>
            </p>
          </div>
          {list(false)}
        </div>
      </aside>
      <header className="app-bar">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href={to("/billing")} className="app-bar-credits" aria-label={`${n} credits, Billing & Credits`}>
            {n} <span>credits</span>
          </Link>
          <button
            className="nav-burger grid size-11 place-items-center rounded-lg text-fg-muted hover:text-fg"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="app-menu"
            data-open={open || undefined}
            onClick={() => setOpenOn(open ? null : path)}
          >
            <span aria-hidden className="nav-burger-lines">
              <i />
              <i />
            </span>
          </button>
        </div>
      </header>
      {open && (
        <div id="app-menu" className="app-sheet">
          <div className="nav-sheet glass-strong rounded-2xl">{list(true)}</div>
        </div>
      )}
    </>
  );
}
