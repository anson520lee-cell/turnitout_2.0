import { AppSidebar } from "@/components/layout/app-sidebar";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Container } from "@/components/ui/section";
import { getSessionUser } from "@/lib/auth/session";
import { getCreditBalance } from "@/lib/credits";

/**
 * The report request form (/services/screening) works without an account — pasting text, seeing
 * the live length/price and opening the dialog is open to guests; only
 * actually submitting requires sign-in, and the server action itself checks
 * that. So these live outside (app), whose layout requires sign-in. Signed-in
 * users get the app shell; guests get the marketing shell. The rest of
 * /orders stays under (app).
 */
export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  if (user) {
    const credits = await getCreditBalance();
    return (
      <div className="orb-workspace relative min-h-dvh lg:flex">
        <AppSidebar email={user.email} isAdmin={user.profile.role === "admin"} credits={credits} />
        <main id="main" className="app-main min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="orb-site">
      <Navbar signedIn={false} />
      {/* public-shell: page headers here take the marketing pages' size (see .public-shell in globals.css) */}
      <main id="main" className="public-shell orb-request-shell relative overflow-x-clip">
        <Container className="relative pb-24 pt-36 sm:pt-44">{children}</Container>
      </main>
      <Footer />
    </div>
  );
}
