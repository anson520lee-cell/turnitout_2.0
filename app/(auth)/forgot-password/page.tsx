import type { Metadata } from "next";
import { ForgotForm } from "@/components/auth/auth-forms";
import { NotConfigured } from "@/components/auth/not-configured";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Reset password" };

export default function Page() {
  return isSupabaseConfigured ? <ForgotForm /> : <NotConfigured />;
}
