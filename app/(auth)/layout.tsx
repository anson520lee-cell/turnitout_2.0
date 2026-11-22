import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="orb-auth relative grid min-h-dvh md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div aria-hidden="true" className="orb-auth-art hidden md:block" />
      <div className="relative flex flex-col px-6 py-8 sm:px-12 md:col-start-2">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
        <div className="flex gap-5 border-t border-[var(--line)] pt-4 text-[13px] text-fg-subtle">
          <Link href="/privacy" className="hover:text-fg">Privacy</Link>
          <Link href="/terms" className="hover:text-fg">Terms</Link>
        </div>
      </div>
    </main>
  );
}
