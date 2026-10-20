import { DailyReportCard, type DailyReportStatus } from "@/components/orders/daily-report-card";

/**
 * Design preview of the daily free report card with made-up allowance:
 * ?state=used for the locked card, ?state=guest for a visitor who has not signed in.
 * Not part of the product and not linked from navigation.
 */
export default async function DailyReportPreviewPage({ searchParams }: PageProps<"/preview/daily-report">) {
  const { state } = await searchParams;
  const status: DailyReportStatus =
    state === "used" ? { mode: "account", remaining: 0, unlimited: false } : state === "guest" ? { mode: "guest" } : { mode: "account", remaining: 1, unlimited: false };
  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-28 sm:px-6">
      <DailyReportCard status={status} />
    </div>
  );
}
