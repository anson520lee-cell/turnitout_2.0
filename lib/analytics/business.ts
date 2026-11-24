import { revenueTotals, type RevenueOrderPayment, type RevenueTopup } from "../payments/revenue";

export const periods = ["7", "30", "90", "all"] as const;
export type Period = typeof periods[number];
const DAY = 86_400_000;
const OFFSET = 8 * 3_600_000;
export const hktDay = (time: number) => new Date(time + OFFSET).toISOString().slice(0, 10);
export function periodStart(period: Period, now: number) {
  return period === "all" ? null : (Math.floor((now + OFFSET) / DAY) - Number(period) + 1) * DAY - OFFSET;
}
export interface Use {
  user: string; product: string; at: string; bought: boolean; completed: boolean; chars?: number;
}
export type Receipt = { at: string } & ({ topup: RevenueTopup } | { payment: RevenueOrderPayment });
export function summarize(uses: Use[], receipts: Receipt[], period: Period, now: number) {
  const start = periodStart(period, now);
  const valid = (n: number) => Number.isFinite(n) && n <= now && (start === null || n >= start);
  const days = new Map<string, number>();
  const hours = Array.from({ length: 24 }, () => new Set<string>());
  const products = new Map<string, { users: Set<string>; uses: number }>();
  const buyers = new Map<string, number>();
  let earliest = now, chars = 0, measured = 0, purchases = 0, transactions = 0;
  let direct = 0, topups = 0, unchecked = 0;
  for (const u of uses) {
    const t = Date.parse(u.at);
    if (!valid(t)) continue;
    earliest = Math.min(earliest, t);
    if (u.bought) {
      purchases++;
      buyers.set(u.user, (buyers.get(u.user) ?? 0) + 1);
      hours[new Date(t + OFFSET).getUTCHours()].add(u.user);
    }
    if (!u.completed) continue;
    const product = products.get(u.product) ?? { users: new Set<string>(), uses: 0 };
    product.users.add(u.user);
    product.uses++;
    products.set(u.product, product);
    if (u.chars !== undefined && Number.isFinite(u.chars) && u.chars > 0) {
      chars += u.chars;
      measured++;
    }
  }
  for (const r of receipts) {
    const t = Date.parse(r.at);
    if (!valid(t)) continue;
    const money = "topup" in r ? revenueTotals([r.topup], []) : revenueTotals([], [r.payment]);
    unchecked += Math.round(money.unchecked * 100);
    if (!money.checked) continue;
    const cents = Math.round(money.checked * 100);
    transactions++;
    direct += Math.round(money.orders * 100);
    topups += Math.round(money.topups * 100);
    earliest = Math.min(earliest, t);
    const day = hktDay(t);
    days.set(day, (days.get(day) ?? 0) + cents);
  }
  const first = hktDay(start ?? earliest);
  const today = hktDay(now);
  let cumulative = 0;
  const series = [];
  for (let t = Date.parse(first); t <= Date.parse(today); t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10);
    const daily = days.get(date) ?? 0;
    cumulative += daily;
    series.push({ date, daily: daily / 100, cumulative: cumulative / 100 });
  }
  const mix = [...products].map(([name, p]) => ({ name, users: p.users.size, uses: p.uses }))
    .sort((a, b) => b.users - a.users || b.uses - a.uses || a.name.localeCompare(b.name));
  return { series, mix, hours: hours.map(h => h.size), purchases, buyers: buyers.size,
    repeat: [...buyers.values()].filter(n => n > 1).length, transactions, total: cumulative / 100,
    direct: direct / 100, topups: topups / 100, unchecked: unchecked / 100,
    measured, average: measured ? Math.round(chars / measured) : null };
}
export type BusinessSummary = ReturnType<typeof summarize>;
