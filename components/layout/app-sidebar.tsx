"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutGrid, ScanText, History, FileStack, FileCheck2, PenLine, Settings, Wallet, Shield, LogOut, Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { signOut } from "@/app/actions/account";
import { cn } from "@/lib/utils";
import { NeuralMark } from "@/components/ui/neural-mark";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/scan", label: "Free Scan", icon: ScanText },
  { href: "/scan/history", label: "Scan History", icon: History },
  { href: "/orders", label: "Orders", icon: FileStack },
  { href: "/services/screening", label: "Get Report", icon: FileCheck2 },
  { href: "/services/refinement", label: "Writing Refinement", icon: PenLine },
  { href: "/billing", label: "Billing & Credits", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ email, isAdmin, credits }: { email: string; isAdmin: boolean; credits: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = isAdmin ? [...nav, { href: "/admin", label: "Admin", icon: Shield }] : nav;

  const list = (
    <nav aria-label="App" className="flex flex-1 flex-col">
      <ul className="space-y-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          // The longest matching item wins, so /scan/history doesn't also light up /scan.
          const matches = (h: string) => path === h || (h !== "/dashboard" && path.startsWith(`${h}/`));
          const active = matches(href) && !items.some((o) => o.href.length > href.length && matches(o.href));
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                data-press
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition",
                  active ? "nav-3d -translate-y-px bg-gradient-to-b from-white/[0.11] to-white/[0.04] text-fg" : "text-fg-muted hover:bg-white/[0.04] hover:text-fg",
                )}
              >
                <Icon className={cn("size-4", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} aria-hidden />
                {label}
                {href === "/billing" && (
                  <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[11px] text-accent">{credits.toLocaleString("en-US")}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto border-t border-[var(--line)] pt-4">
        <p className="truncate px-3 text-[12px] text-fg-subtle" title={email}>{email}</p>
        <form action={signOut}>
          <button className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] text-fg-muted hover:bg-white/[0.04] hover:text-fg">
            <LogOut className="size-4" aria-hidden /> Log out
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="sidebar-glass sticky top-0 hidden h-dvh w-64 shrink-0 flex-col p-4 lg:flex">
        <div className="mb-6 px-2 pt-1">
          <Logo />
          <p className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">
            <NeuralMark className="text-accent" />
            Pattern Engine online
          </p>
        </div>
        {list}
      </aside>
      <div className="sidebar-glass-bar sticky top-0 z-40 flex h-14 items-center justify-between px-4 lg:hidden">
        <Logo />
        <button
          className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-white/5"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="fixed inset-x-0 top-14 bottom-0 z-40 flex flex-col bg-ink-950/95 p-4 backdrop-blur-xl lg:hidden">{list}</div>
      )}
    </>
  );
}
