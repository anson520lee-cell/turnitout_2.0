import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { ScanResult } from "@/components/scan/scan-result";
import { getAnalyzer } from "@/lib/scanning";
import type { Order, ScanResultRow } from "@/types/domain";

/**
 * A design-review page, not part of the product: the signed-in shell, overview
 * and scan report drawn from sample data, so the look can be checked without an
 * account or database. Not linked from navigation.
 */
const SAMPLE = `Artificial intelligence has transformed the way students approach academic writing. Moreover, it offers a wide range of benefits that cannot be ignored. Furthermore, the technology continues to evolve at a rapid pace.

In conclusion, it is important to note that the role of technology in education is multifaceted. Additionally, educators must carefully consider how to integrate these tools. On the other hand, there are genuine concerns about originality.

I wrote the first draft on a bus, half asleep, and my tutor circled the one sentence that actually sounded like me. We kept that one. The rest I rebuilt from my own notes over a weekend, arguing with myself in the margins.`;

const now = new Date().toISOString();
const order = (id: string, service_type: Order["service_type"], status: Order["status"], title: string, price: number): Order => ({
  id, user_id: "demo", service_type, status, title, price, currency: "HKD", word_count: 1840, instructions: null, source_text: null,
  admin_checklist: {} as Order["admin_checklist"], created_at: now, updated_at: now, paid_at: null, completed_at: null, cancelled_at: null, source_deleted_at: null,
});

export default async function AppModulesPreview() {
  const result = await getAnalyzer().analyze(SAMPLE);
  const orders = [
    order("a1b2c3d4-0000-0000-0000-000000000001", "combined_screening", "screening", "Essay draft 2", 35),
    order("a1b2c3d4-0000-0000-0000-000000000002", "refinement", "awaiting_payment", "Literature review", 55),
  ];
  const scans: ScanResultRow[] = (["low", "moderate", "elevated"] as const).map((risk, i) => ({
    id: `s${i}`, user_id: "demo", word_count: 620 + i * 410, overall_risk: risk, result_json: result, analyzer: "heuristic", created_at: now,
  }));
  return (
    <div className="app-main relative min-h-dvh lg:flex">
      <AppSidebar email="jordan@example.com" isAdmin credits={1250} />
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl space-y-12">
          <DashboardView email="jordan@example.com" displayName="Jordan" remaining={2} orders={orders} scans={scans} pendingClaims={new Set()} />
          <ScanResult result={result} />
        </div>
      </main>
    </div>
  );
}
