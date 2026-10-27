"use client";
import { useRouter } from "next/navigation";
import { ReportScan } from "@/components/reports/scan/report-scan";
import { useLiveReportFeed } from "@/components/reports/scan/use-report-feed";

/**
 * Keeps an automatic report moving while this page is open and shows the live
 * scan over the customer's text meanwhile. When the scan is over (or the report
 * failed) the page reloads and shows the report. Closing the page only pauses
 * the report; the saved pieces stay, and the next visit carries on from there.
 */
export function AutoReportRunner({ orderId, text, title, reference, canSkip = false }: { orderId: string; text: string; title: string; reference: string; canSkip?: boolean }) {
  const router = useRouter();
  const feed = useLiveReportFeed(orderId);
  return <ReportScan text={text} feed={feed} title={title} reference={reference} onFinish={() => router.refresh()} canSkip={canSkip} />;
}
