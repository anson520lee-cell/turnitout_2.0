import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="relative grid min-h-dvh overflow-hidden">
      {/* One soft glow behind the centred form; sign-in stays plain and quick, with nothing moving in its way. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_46%,rgb(91_140_255/0.14),transparent_72%)]" />
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
