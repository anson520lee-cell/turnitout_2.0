import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { CssDocument } from "@/components/landing/css-document";
import { disclaimers } from "@/config/services";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="noise relative grid min-h-dvh overflow-hidden lg:grid-cols-[1fr_1.05fr]">
      {/* One continuous backdrop behind both halves, so the glow flows across the seam instead of stopping at a panel edge. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(70%_80%_at_62%_46%,rgb(91_140_255/0.20),transparent_72%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(40%_50%_at_18%_38%,rgb(91_140_255/0.08),transparent_75%)]" />
        <div className="absolute inset-0 bg-grid opacity-70 [mask-image:radial-gradient(75%_75%_at_62%_46%,black,transparent)]" />
      </div>
      <div className="relative flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
        <p className="text-[11.5px] text-fg-subtle">
          <Link href="/privacy" className="hover:text-fg">Privacy</Link> · <Link href="/terms" className="hover:text-fg">Terms</Link>
        </p>
      </div>
      <aside className="relative hidden lg:block" aria-hidden>
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
