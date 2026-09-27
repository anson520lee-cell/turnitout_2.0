import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { SettingsForms } from "@/components/dashboard/settings-forms";
import { requireUser } from "@/lib/auth/session";
import { brand, retention } from "@/config/app";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  return (
    <>
      <AppHeader title="Settings" body="Your account and data." />
      <div className="grid gap-5 lg:grid-cols-2">
        <SettingsForms displayName={user.profile.display_name ?? ""} email={user.email} />
        <Card className="p-5 sm:p-6">
          <h2 className="text-[15px] font-semibold">Your data</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-fg-muted">
            <li>Source documents are deleted {retention.sourceDocumentDays} days after an order completes.</li>
            <li>Reports are deleted {retention.reportDays} days after completion.</li>
            <li>Free-scan text is {retention.storeScanText ? "stored with your scan history" : "not stored"}.</li>
            <li>To delete your account and all data, email <a className="text-accent underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
