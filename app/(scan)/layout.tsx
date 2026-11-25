import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Container } from "@/components/ui/section";

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {/* public-shell: page headers here take the marketing pages' size (see .public-shell in globals.css) */}
      <main id="main" className="public-shell relative overflow-x-clip">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(50%_60%_at_50%_0%,rgb(91_140_255/0.14),transparent_70%)]" />
        <Container className="relative pb-24 pt-36 sm:pt-44">{children}</Container>
      </main>
      <Footer />
    </>
  );
}
