"use client";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutGrid, FileStack, FileCheck2, Settings, Wallet, Shield, LogOut, Menu, X } from "lucide-react";
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

export function AppSidebar({ email, isAdmin, credits }: { email: string; isAdmin: boolean; credits: number }) {
  const path = usePathname();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const open = menuPath === path;
  const toggle = useRef<HTMLButtonElement>(null);
  const items = isAdmin ? [...nav, { href: "/admin", label: "Admin", icon: Shield }] : nav;

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

  const list = (
    <nav aria-label="App" className="flex flex-1 flex-col">
      <ul className="space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          // The longest matching item wins.
          const matches = (h: string) => path === h || (h !== "/dashboard" && path.startsWith(`${h}/`));
          const active = matches(href) && !items.some((o) => o.href.length > href.length && matches(o.href));
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setMenuPath(null)}
                aria-current={active ? "page" : undefined}
                data-press
                className={cn("glass-item group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13.5px]", active ? "glass-item-active text-fg" : "text-fg-muted hover:text-fg")}
              >
                <Icon className={cn("glass-item-icon size-4", active ? "text-accent" : "text-fg-subtle group-hover:text-accent")} aria-hidden />
                {label}
                {href === "/billing" && (
                  <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[11px] text-accent">{credits.toLocaleString("en-US")}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto border-t border-white/10 pt-4">
        <p className="truncate px-3 text-[12px] text-fg-subtle" title={email}>{email}</p>
        <form action={signOut}>
          <button className="glass-item group mt-2 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-[13.5px] text-fg-muted hover:text-fg">
            <LogOut className="glass-item-icon size-4" aria-hidden /> Log out
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-[17.5rem] shrink-0 p-3 lg:block">
        <div className="sidebar-glass relative flex h-full flex-col rounded-[28px] p-4">
          <div className="mb-6 px-2 pt-1">
            <Logo />
            <p className="orb-label mt-5"><span className="orb-indicator" /> Workspace</p>
          </div>
          {list}
        </div>
      </aside>
      <header className="sidebar-glass-bar sticky top-0 z-40 flex h-14 items-center justify-between px-4 lg:hidden">
        <Logo />
        <button
          ref={toggle}
          type="button"
          className="glass-item grid size-11 place-items-center rounded-xl text-fg-muted hover:text-fg"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="workspace-menu"
          onClick={() => setMenuPath(open ? null : path)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>
      <div id="workspace-menu" hidden={!open} className="fixed inset-x-0 top-14 bottom-0 z-40 p-3 lg:hidden">
        {open && (
          <div className="sidebar-glass sidebar-glass-sheet relative flex h-full flex-col overflow-y-auto rounded-[28px] p-4">{list}</div>
        )}
      </div>
    </>
  );
}
