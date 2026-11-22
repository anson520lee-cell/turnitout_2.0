import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PageScan } from "@/components/motion/page-scan";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main id="main" className="overflow-x-clip">
        {children}
      </main>
      <Footer />
      <PageScan />
    </>
  );
}
