import type { Metadata } from "next";
import { SettingsView } from "@/components/dashboard/settings-view";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  return <SettingsView displayName={user.profile.display_name ?? ""} email={user.email} />;
}
