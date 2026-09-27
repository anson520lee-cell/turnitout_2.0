import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "@/components/auth/auth-forms";
import { NotConfigured } from "@/components/auth/not-configured";
import { features } from "@/config/app";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign up" };

export default function Page() {
  if (!isSupabaseConfigured) return <NotConfigured />;
  return (
    <Suspense>
      <SignupForm google={features.googleSignIn} />
    </Suspense>
  );
}
