import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="noise relative grid min-h-dvh overflow-hidden">
      {/* Soft glow behind the centred sign-in window. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(70%_80%_at_50%_46%,rgb(91_140_255/0.20),transparent_72%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(40%_50%_at_50%_46%,rgb(91_140_255/0.08),transparent_75%)]" />
        <div className="absolute inset-0 bg-grid opacity-70 [mask-image:radial-gradient(75%_75%_at_50%_46%,black,transparent)]" />
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
    </main>
  );
}
