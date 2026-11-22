import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { brand } from "@/config/app";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return <span className={cn("orb-logomark", className)} aria-hidden="true" />;
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("orb-wordmark", className)} aria-label={`${brand.name} home`}>
      <LogoMark />
      {brand.name}
    </Link>
  );
}
