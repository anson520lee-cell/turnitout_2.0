import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/app-header";
import { ScanWorkspace } from "@/components/scan/scan-workspace";
import { ScanResult } from "@/components/scan/scan-result";
import { Badge } from "@/components/ui/badge";
import { getRemainingScans } from "@/lib/scanning/usage";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/schemas";
import { formatDateTime } from "@/lib/utils";
import type { ScanResultRow } from "@/types/domain";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = { title: "Preliminary scan" };

export default async function ScanPage({ searchParams }: PageProps<"/scan">) {
  const { id } = await searchParams;
  if (typeof id === "string" && uuid.safeParse(id).success) {
    const supabase = await createClient();
    const { data } = await supabase.from("scan_results").select("*").eq("id", id).maybeSingle<ScanResultRow>();
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
  const remaining = await getRemainingScans();
  return (
    <>
      <AppHeader
        eyebrow={<Badge tone="accent" dot>Free · website-generated</Badge>}
        title="Preliminary writing scan"
        body="Instant analysis of writing patterns that may contribute to automated detector risk. This is our own estimate, not a Turnitin result."
      />
      <ScanWorkspace initialRemaining={remaining} />
    </>
  );
}
