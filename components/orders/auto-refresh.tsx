"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Refreshes waiting pages while visible. Payment checks start quickly,
 * then back off while confirmation is taking longer.
 */
export function AutoRefresh({
  every = 20_000,
  maxEvery = every,
  className,
}: {
  every?: number;
  maxEvery?: number;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = every;

    const refresh = () => {
      start(() => router.refresh());
      setCheckedAt(new Date());
    };
    const schedule = () => {
      timer = setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        refresh();
        delay = Math.min(delay * 2, maxEvery);
        schedule();
      }, delay);
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      refresh();
      delay = every;
      schedule();
    };

    if (document.visibilityState === "visible") schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, every, maxEvery]);

  return (
    <p className={cn("flex items-center justify-center gap-2 text-[11.5px] text-fg-subtle", className)}>
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inline-flex size-full rounded-full bg-ok/60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-ok" />
      </span>
      <span>
        {maxEvery > every
          ? `Checking for updates every ${every / 1000}–${maxEvery / 1000} s while this tab is open`
          : `Checking for updates every ${every / 1000} s`}
        {checkedAt && ` · last checked ${checkedAt.toLocaleTimeString("en-HK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
      </span>
      <button
        type="button"
        disabled={pending}
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
