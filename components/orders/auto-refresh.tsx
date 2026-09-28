"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Re-fetches the server page every `every` ms while the tab is visible, and
 * once when the tab becomes visible again. The page mounts this only in
 * waiting states, so it stops by itself once the status moves on.
 */
export function AutoRefresh({ every = 20_000, className }: { every?: number; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      start(() => router.refresh());
      setCheckedAt(new Date());
    };
    const t = setInterval(refresh, every);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, every]);

  return (
    <p className={cn("flex items-center justify-center gap-2 text-[11.5px] text-fg-subtle", className)}>
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inline-flex size-full rounded-full bg-ok/60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-ok" />
      </span>
      <span>
        Checking for updates every {Math.round(every / 1000)} s
        {checkedAt && ` · last checked ${checkedAt.toLocaleTimeString("en-HK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
      </span>
      <button
        type="button"
        onClick={() => {
          start(() => router.refresh());
          setCheckedAt(new Date());
        }}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-fg-muted underline-offset-4 hover:text-fg hover:underline"
      >
        <RefreshCw className={cn("size-3", pending && "animate-spin")} aria-hidden /> Refresh now
      </button>
    </p>
  );
}
