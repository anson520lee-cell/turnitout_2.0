"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function GoogleButton({ next }: { next: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className="w-full"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await createClient().auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
      }}
    >
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path fill="#fff" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.68 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.7 3.72 14.56 2.8 12 2.8 6.92 2.8 2.8 6.92 2.8 12s4.12 9.2 9.2 9.2c5.31 0 8.83-3.73 8.83-8.99 0-.6-.07-1.06-.15-1.51z" />
      </svg>
      Continue with Google
    </Button>
  );
}

export function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
      <span className="h-px flex-1 bg-[var(--line)]" />
      or
      <span className="h-px flex-1 bg-[var(--line)]" />
    </div>
  );
}
