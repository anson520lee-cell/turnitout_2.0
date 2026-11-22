import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/ui/section";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main id="main" className="min-h-[70vh] overflow-x-clip">
        <PageHeader
          eyebrow="404"
          title="That page"
          outline="isn’t here."
          body="The link may be old or mistyped. Here are some places to start."
        />
        <Container className="pb-24 pt-10">
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/" className={buttonClasses("primary", "lg")}>Back to home</Link>
            <Link href="/services/screening" className={buttonClasses("secondary", "lg")}>Get report</Link>
            <Link href="/services" className={buttonClasses("secondary", "lg")}>See services</Link>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
