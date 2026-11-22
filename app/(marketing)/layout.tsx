import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="orb-site">
      <Navbar />
      <main id="main" className="overflow-x-clip">
        {children}
      </main>
      <Footer />
    </div>
  );
}
