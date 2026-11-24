import { notFound } from "next/navigation";
import { BusinessDashboard } from "@/components/admin/business-dashboard";
import { periods, summarize, type Receipt, type Use } from "@/lib/analytics/business";

export const metadata = { title: "Business analytics preview", robots: { index: false, follow: false } };

export default async function Preview({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const { period: requested } = await searchParams;
  const period = periods.find(p => p === requested) ?? "30";
  const now = Date.UTC(2026, 10, 25, 12);
  const uses: Use[] = [], receipts: Receipt[] = [];
  for (let day = 0; day < 120; day++) {
    for (let j = 0; j < 3 + day % 9; j++) {
      const at = new Date(now - day * 86_400_000 - (j * 7 % 19) * 3_600_000).toISOString();
      const bought = j % 3 === 0;
      const product = j === 6 ? "Writing Refinement" : bought ? "Paid report" : "Daily free report";
      uses.push({ user: "sample-" + ((day * 7 + j) % 91), product, at, bought, completed: true,
        chars: product === "Writing Refinement" ? undefined : 1600 + (day * 97 + j * 349) % 4200 });
      if (bought && (day + j) % 3 !== 0) receipts.push({ at, payment: { amount: 900, provider: "alipay", orderStatus: "completed", claimStatus: "confirmed" } });
    }
    if (day % 5 === 0) receipts.push({ at: new Date(now - day * 86_400_000).toISOString(), topup: { usd: 10 } });
  }
  return <main className="app-main mx-auto min-h-dvh max-w-7xl px-4 py-8 sm:px-8">
    <BusinessDashboard key={period} data={summarize(uses, receipts, period, now)} period={period} preview/>
  </main>;
}
