import Link from "next/link";
import { brand } from "@/config/app";
import { cn } from "@/lib/utils";

/** Original geometric mark: two offset sheets crossed by a scan line. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <defs>
        <linearGradient id="lm-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8fb0ff" />
          <stop offset="1" stopColor="#8a6dff" />
        </linearGradient>
      </defs>
      <rect x="9" y="4" width="17" height="22" rx="3.5" fill="none" stroke="url(#lm-a)" strokeOpacity="0.45" strokeWidth="1.5" />
      <rect x="5" y="7" width="17" height="22" rx="3.5" fill="#0b1020" stroke="url(#lm-a)" strokeWidth="1.6" />
      <path d="M9 13h9M9 17h6M9 21h8" stroke="#c9d6ff" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2.5 16.5h27" stroke="#5fd8f5" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", className)} aria-label={`${brand.name} home`}>
      <LogoMark className="transition-transform duration-300 group-hover:-rotate-3" />
      <span className="text-[15px] font-semibold tracking-tight text-fg">{brand.name}</span>
    </Link>
  );
}
