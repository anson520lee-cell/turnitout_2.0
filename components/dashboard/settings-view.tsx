import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { SettingsForms } from "@/components/dashboard/settings-forms";
import { brand } from "@/config/app";
import { retentionSentence } from "@/config/privacy-copy";

/** Settings. Takes plain data so the real page and the design preview render the same thing. */
export function SettingsView({ displayName, email, preview }: { displayName: string; email: string; preview?: boolean }) {
  return (
    <>
      <AppHeader title="Settings" body="Your account and data." />
      <div className="grid gap-5 lg:grid-cols-2">
        <SettingsForms displayName={displayName} email={email} preview={preview} />
        <Card className="p-5 sm:p-6">
          <h2 className="app-k">
            <span className="nav-idx">02</span> Your data
          </h2>
          <ul className="app-points mt-4 text-[13px] leading-relaxed text-fg-muted">
            <li>{retentionSentence.source}</li>
            <li>{retentionSentence.reports}</li>
            <li>
              To delete your account and all data, email{" "}
              <a className="text-accent underline" href={`mailto:${brand.supportEmail}`}>
                {brand.supportEmail}
              </a>
              .
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
