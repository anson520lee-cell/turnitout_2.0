import { AppSidebar } from "@/components/layout/app-sidebar";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Container } from "@/components/ui/section";
import { getSessionUser } from "@/lib/auth/session";

/**
 * /scan and the report/refinement request forms (/services/screening,
 * /services/refinement) all work without an account — pasting text, seeing
 * the live length/price and opening the dialog is open to guests; only
 * actually submitting requires sign-in, and the server action itself checks
 * that. So these live outside (app), whose layout requires sign-in. Signed-in
 * users get the app shell; guests get the marketing shell. /scan/history and
 * the rest of /orders stay under (app).
 */
export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  if (user) {
    return (
      <div className="relative min-h-dvh lg:flex">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(50%_40%_at_70%_0%,rgb(91_140_255/0.08),transparent_70%)]" />
        <AppSidebar email={user.email} isAdmin={user.profile.role === "admin"} />
        <main id="main" className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <>
      <Navbar signedIn={false} />
      <main id="main" className="relative overflow-x-clip">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(50%_60%_at_50%_0%,rgb(91_140_255/0.14),transparent_70%)]" />
        <Container className="relative pb-24 pt-28 sm:pt-32">{children}</Container>
      </main>
      <Footer />
    </>
  );
}
