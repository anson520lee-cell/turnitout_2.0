import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/ui/section";
import { buttonClasses } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";

export default async function NotFound() {
  const user = await getSessionUser();
  return (
    <>
      <Navbar signedIn={Boolean(user)} />
      <main id="main" className="min-h-[70vh] overflow-x-clip">
        <PageHeader
          eyebrow="404"
          title="That page isn’t here."
          body="The link may be old or mistyped. Here are some places to start."
        />
        <Container className="pb-24">
          <div className="flex flex-wrap gap-3">
            <Link href="/" className={buttonClasses("primary", "lg")}>Back to home</Link>
            <Link href="/scan" className={buttonClasses("secondary", "lg")}>Run free scan</Link>
            <Link href="/services" className={buttonClasses("secondary", "lg")}>See services</Link>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
