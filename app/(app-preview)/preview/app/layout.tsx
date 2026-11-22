import type { Metadata } from "next";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { demoBalance, demoEmail } from "./demo";

// Design preview of the signed-in app with a made-up account: reachable by link, kept out of search results.
export const metadata: Metadata = {
  title: "App design preview",
  robots: { index: false, follow: false },
};

export default function AppPreviewLayout({ children }: LayoutProps<"/preview/app">) {
  return (
    <div className="relative min-h-dvh lg:flex">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(50%_40%_at_70%_0%,rgb(91_140_255/0.08),transparent_70%)]" />
      <AppSidebar email={demoEmail} isAdmin={false} credits={demoBalance} preview />
      <main id="main" className="app-main min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
