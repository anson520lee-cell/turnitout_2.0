import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { CssDocument } from "@/components/landing/css-document";
import { disclaimers } from "@/config/services";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="noise relative grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="relative flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
        <p className="text-[11.5px] text-fg-subtle">
          <Link href="/privacy" className="hover:text-fg">Privacy</Link> · <Link href="/terms" className="hover:text-fg">Terms</Link>
        </p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-[var(--line)] bg-ink-900/60 lg:block" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_45%,rgb(91_140_255/0.22),transparent_70%)]" />
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(closest-side,black,transparent)]" />
        <div className="absolute inset-x-0 top-[8%] bottom-[22%]">
          <CssDocument />
        </div>
        <div className="absolute inset-x-12 bottom-12">
          <p className="text-xl font-semibold tracking-tight">Designed for genuine student writing.</p>
          <p className="mt-2 max-w-md text-[13px] text-fg-muted">{disclaimers.turnitin}</p>
        </div>
      </aside>
    </main>
  );
}
