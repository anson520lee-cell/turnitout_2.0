import { FreeReportCard, type FreeReportCardStatus } from "@/components/orders/free-report-card";

/**
 * Design preview of the free report card with made-up allowance:
 * ?state=used for the locked card, ?state=guest for a visitor who has not signed in.
 * Not part of the product and not linked from navigation.
 */
export default async function FreeReportPreviewPage({ searchParams }: PageProps<"/preview/free-report">) {
  const { state } = await searchParams;
  const status: FreeReportCardStatus =
    state === "used" ? { mode: "account", remaining: 0, unlimited: false } : state === "guest" ? { mode: "guest" } : { mode: "account", remaining: 1, unlimited: false };
  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-28 sm:px-6">
      <FreeReportCard status={status} />
    </div>
  );
}
