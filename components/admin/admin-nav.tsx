"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/prompt", label: "AI prompt" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav({ email }: { email: string }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-ink-950/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-8">
        <Link href="/admin" className="flex items-center gap-2">
          <LogoMark className="size-6" />
          <span className="text-[14px] font-semibold">Admin</span>
        </Link>
        <nav aria-label="Admin" className="flex flex-1 gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
                className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px]", active ? "bg-white/[0.07] text-fg" : "text-fg-muted hover:text-fg")}>
                {t.label}
              </Link>
            );
          })}
        </nav>
        <span className="hidden text-[12px] text-fg-subtle md:block">{email}</span>
        <Link href="/dashboard" className="text-[12.5px] text-fg-muted hover:text-fg">Exit</Link>
      </div>
    </header>
  );
}
