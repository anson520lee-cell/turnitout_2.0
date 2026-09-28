import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { ScanWorkspace, type ScanAccess } from "@/components/scan/scan-workspace";
import { ScanResult } from "@/components/scan/scan-result";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { localModelEnabled } from "@/lib/local-model/jobs";
import { guestRemainingScans } from "@/lib/scanning/guest";
import { getRemainingScans } from "@/lib/scanning/usage";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/schemas";
import { formatDateTime } from "@/lib/utils";
import type { ScanResultRow } from "@/types/domain";
import { localModel } from "@/config/app";

export const metadata: Metadata = { title: "Free writing scan" };

export default async function ScanPage({ searchParams }: PageProps<"/scan">) {
  const { id } = await searchParams;
  const user = await getSessionUser();

  // A saved result: account only, and only the owner's.
  let missing = false;
  if (typeof id === "string") {
    if (!user) redirect(`/login?next=${encodeURIComponent(`/scan?id=${id}`)}`);
    if (uuid.safeParse(id).success) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("scan_results")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle<ScanResultRow>();
      if (data) {
        return (
          <>
            <AppHeader
              title="Scan result"
              body="A saved preliminary scan. The original text isn't stored."
              actions={<Link href="/scan" className={buttonClasses("primary", "md")}>New scan</Link>}
            />
            <ScanResult result={data.result_json} createdAt={formatDateTime(data.created_at)} />
          </>
        );
      }
    }
    missing = true;
  }

  let access: ScanAccess;
  if (!isSupabaseConfigured) {
    access = { mode: "offline", reason: "not_configured" };
  } else if (user) {
    access = { mode: "account", remaining: await getRemainingScans() };
  } else {
    try {
      access = { mode: "guest", remaining: await guestRemainingScans() };
    } catch (e) {
      // Usually a missing SUPABASE_SERVICE_ROLE_KEY or migration 0002 not applied.
      console.error("[scan] guest allowance unavailable:", e instanceof Error ? e.message : "unknown error");
      access = { mode: "offline", reason: "guest_unavailable" };
    }
  }

  return (
    <>
      <AppHeader
        eyebrow={<Badge tone="accent" dot>Free · website-generated</Badge>}
        title="Preliminary writing scan"
        body="Instant analysis of writing patterns that may contribute to automated detector risk. This is our own estimate, not a Turnitin result."
        actions={
          user ? (
            <Link href="/scan/history" className={buttonClasses("ghost", "md")}>Scan history</Link>
          ) : undefined
        }
      />
      {missing && (
        <div className="mb-6">
          <FormMessage tone="info">That saved scan wasn&rsquo;t found in your history. You can run a new one below.</FormMessage>
        </div>
      )}
      <ScanWorkspace access={access} modelFeedback={localModelEnabled() && localModel.scanFeedback} />
    </>
  );
}
