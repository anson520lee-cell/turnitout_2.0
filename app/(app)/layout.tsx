import { AppSidebar } from "@/components/layout/app-sidebar";
import { requireUser } from "@/lib/auth/session";
import { getCreditBalance } from "@/lib/credits";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const credits = await getCreditBalance();
  return (
    <div className="relative min-h-dvh lg:flex">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(50%_40%_at_70%_0%,rgb(91_140_255/0.08),transparent_70%)]" />
      <AppSidebar email={user.email} isAdmin={user.profile.role === "admin"} credits={credits} />
      <main id="main" className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

// Refinement drafts are written by DeepSeek after the response (lib/local-model/jobs.ts).
export const maxDuration = 300;
