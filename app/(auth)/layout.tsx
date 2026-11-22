import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="auth-layout">
      <div className="studio-width auth-rail">
        <Logo />
      </div>
      <div className="studio-width auth-stage">
        <div aria-hidden className="auth-study">
          <Image src="/field/sentence.webp" alt="" width={840} height={670} unoptimized />
        </div>
        <div>{children}</div>
      </div>
      <div className="studio-width auth-bottom">
        <p>
          <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
        </p>
      </div>
    </main>
  );
}
