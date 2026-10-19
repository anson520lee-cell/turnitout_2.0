"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Container, Eyebrow } from "@/components/ui/section";
import { buttonClasses } from "@/components/ui/button";
import { brand } from "@/config/app";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="grid min-h-[80vh] place-items-center py-24">
      <Container className="max-w-xl text-center">
        <Eyebrow>Something went wrong</Eyebrow>
        <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">This page didn’t load properly.</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">
          It’s on our side. Try again, or go back to the home page. If it keeps happening, email {brand.supportEmail}.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => retry()} className={buttonClasses("primary", "lg")}>Try again</button>
          <Link href="/" className={buttonClasses("secondary", "lg")}>Back to home</Link>
        </div>
      </Container>
    </main>
  );
}
