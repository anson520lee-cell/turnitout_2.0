import { SettingsView } from "@/components/dashboard/settings-view";
import { demoEmail, demoName } from "../demo";

/** Settings for a made-up account: the real forms, but nothing is saved. */
export default function AppPreviewSettings() {
  return <SettingsView displayName={demoName} email={demoEmail} preview />;
}
