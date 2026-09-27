import type { Metadata } from "next";
import { ResetForm } from "@/components/auth/auth-forms";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New password" };

export default async function Page() {
  await requireUser("/forgot-password");
  return <ResetForm />;
}
