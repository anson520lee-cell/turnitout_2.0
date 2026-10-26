/**
 * All prices live here. Amounts are in HKD cents (Stripe's minor unit).
 * Components read from this file; nothing else hard-codes a price.
 * Prices are always recomputed on the server from this config; the browser
 * never sends an amount.
 */
export const currency = "hkd" as const;

export type ScreeningServiceType =
  | "ai_screening"
  | "similarity_screening"
  | "combined_screening";
export type ServiceType = ScreeningServiceType | "refinement";

/**
 * Flat prices of the old hand-made reports. Kept only so older orders still
 * render; new reports are priced by length (`reportPricing`). The three service
 * types are kept for older orders; new orders are always `combined_screening`.
 */
export const screeningPrices: Record<ScreeningServiceType, number> = {
  ai_screening: 3500,
  similarity_screening: 3500,
  combined_screening: 3500,
};

export const screeningWordRange = { min: 450, max: 29000 } as const;

/**
 * Writing refinement is priced per 1,000 characters (spaces included) with a
 * minimum charge: 1 credit (HK$1) per 1,000 characters, minimum 3 credits
 * (3,000 characters). (Cut to a fifth of the old prices on 2026-10-25: it used
 * to be 1 credit per 200 characters, minimum 15.)
 * price = max(minimum, ceil(chars / blockChars) * perBlock)
 */
export const refinementPricing = {
  minimum: 300,
  blockChars: 1000,
  perBlock: 100,
} as const;

/**
 * The automatic AI-writing risk report is priced per 1,000 characters (spaces
 * included): 1 credit per 1,000 characters, minimum 2 credits (2,000
 * characters), for texts of 500 to 100,000 characters. (Cut to a fifth of the
 * old prices on 2026-10-25: it used to be 1 credit per 200 characters,
 * minimum 10.)
 *
 * Charging repeats in cycles of `cycleChars` (20,000) characters: the first
 * `chargedChars` (8,000) of each cycle are charged, and the rest of the cycle
 * (12,000) is free. The next cycle starts charging again, up to `maxChars`. So
 * one cycle costs at most 8 credits and a 100,000-character text (5 cycles) 40
 * credits. Pricing counts characters, not pieces: the text is reviewed in pieces
 * of about 3,500 characters, and a piece that straddles a cycle edge is neither
 * split nor priced differently.
 * price = max(minimum, ceil(chargedChars(chars) / blockChars) * perBlock)
 */
export const reportPricing = {
  minimum: 200,
  blockChars: 1000,
  perBlock: 100,
  minChars: 500,
  maxChars: 100_000,
  cycleChars: 20_000,
  chargedChars: 8_000,
} as const;

/** The characters of a text that are charged for: the first `chargedChars` of every `cycleChars`. */
export function reportChargedChars(chars: number): number {
  const { cycleChars, chargedChars } = reportPricing;
  const whole = Math.floor(chars / cycleChars);
  return whole * chargedChars + Math.min(chargedChars, chars - whole * cycleChars);
}

export function reportPrice(chars: number): number {
  const blocks = Math.max(1, Math.ceil(reportChargedChars(chars) / reportPricing.blockChars));
  return Math.max(reportPricing.minimum, blocks * reportPricing.perBlock);
}

/**
 * Writing Refinement, the add-on after a report: suggested rewrites of the sentences the report flagged. Jordan
 * (2026-10-26): price it as the same multiple of the report's price as its cost is of the report's cost. Estimated
 * from the report's real DeepSeek use (about US$0.010 per 3,500-character piece): one rewrite pass over a report
 * costs about 0.8 to 1 times its report, so the multiple is 1. Re-measure from the model_usage log (purpose
 * "report_rewrite") and change it here. A report that was free is priced as the paid report of the same length.
 */
export const rewritePricing = { multiple: 1 } as const;

/** Price of the add-on in cents: `reportCents` is what the report cost (0 for a free one, then the price of `chars` characters). */
export function rewritePrice(reportCents: number, chars: number): number {
  const base = reportCents > 0 ? reportCents : reportPrice(Math.max(reportPricing.minChars, chars));
  return Math.max(100, Math.ceil((base * rewritePricing.multiple) / 100) * 100);
}

export function screeningPrice(type: ScreeningServiceType): number {
  return screeningPrices[type];
}

/** Characters as billed: whitespace runs count as one space, ends trimmed. */
export function billableChars(text: string): number {
  return text.replace(/\s+/g, " ").trim().length;
}

export function refinementPrice(chars: number): number {
  const blocks = Math.max(1, Math.ceil(chars / refinementPricing.blockChars));
  return Math.max(refinementPricing.minimum, blocks * refinementPricing.perBlock);
}

/**
 * Service prices are shown as credits. They stay stored in HKD cents (so existing
 * orders are unchanged): 100 cents = 1 credit, i.e. a 3,000-character report is 3 credits.
 */
export const CENTS_PER_CREDIT = 100;

export function toCredits(cents: number): number {
  return Math.round(cents / CENTS_PER_CREDIT);
}

/** "3 credits" / "1 credit". */
export function formatCredits(cents: number): string {
  const c = toCredits(cents);
  if (c === 0) return "Free";
  return `${c.toLocaleString("en-HK")} ${c === 1 ? "credit" : "credits"}`;
}

/**
 * Top-ups are bought in US dollars (card, PayPal) or crypto (USDT, USDC, BTC),
 * and credited at a fixed rate; service prices stay as they are in credits:
 * US$1 = 8 credits (8 credits = US$1), so a US$10 top-up is 80 credits, one
 * 3-credit report (3,000 characters) costs about US$0.38. Change the rate here and nowhere else.
 */
export const CREDITS_PER_USD = 8;
export const topUpCurrency = "usd" as const;

/** A price in cents (100 = 1 credit) in US dollars at the top-up rate, to the cent: 3 credits = US$0.38. */
export function priceUsd(cents: number): number {
  return Math.round((toCredits(cents) * 100) / CREDITS_PER_USD) / 100;
}

/**
 * Whole US dollars. Crypto: any amount from US$10 (NOWPayments won't take less than about US$9 to 15
 * depending on the coin; USDT on TRON is the highest, about US$14.4, and the top-up screen checks each
 * coin's own minimum before the customer pays). PayPal (confirmed by hand) and card have no such floor,
 * so they offer a US$5 first step; they take preset amounts only.
 */
export const topUp = {
  presetsUsd: [10, 20, 100, 200, 500],
  minUsd: 10,
  presetsOtherUsd: [5, 10, 20, 100, 200, 500],
  minOtherUsd: 5,
  maxUsd: 10000,
} as const;

/**
 * Bonus credits on larger top-ups, as a percent of the base credits. The highest
 * tier at or below the amount applies. Every top-up method uses the same rule.
 */
export const topUpBonusTiers = [
  { minUsd: 500, percent: 30 },
  { minUsd: 200, percent: 25 },
  { minUsd: 100, percent: 15 },
  { minUsd: 20, percent: 5 },
] as const;

export function topUpBonusPercent(usd: number): number {
  return topUpBonusTiers.find((t) => usd >= t.minUsd)?.percent ?? 0;
}

/** Credits added by a top-up: US$ x CREDITS_PER_USD, plus the bonus for larger amounts. */
export function usdToCredits(usd: number): number {
  const base = Math.floor(usd * CREDITS_PER_USD + 1e-9);
  return Math.floor((base * (100 + topUpBonusPercent(usd))) / 100);
}

export function formatUSD(usd: number): string {
  return `US$${usd.toLocaleString("en-US")}`;
}

/** Null when `usd` is an allowed whole-dollar top-up amount. `crypto` picks the crypto floor (default) or the lower one for PayPal and card. */
export function topUpAmountError(usd: number, crypto = true): string | null {
  const min = crypto ? topUp.minUsd : topUp.minOtherUsd;
  if (!Number.isInteger(usd)) return "Enter a whole number of US dollars.";
  if (usd < min) return `The minimum top-up is ${formatUSD(min)}.`;
  if (usd > topUp.maxUsd) return `The maximum top-up is ${formatUSD(topUp.maxUsd)}.`;
  return null;
}

export function formatHKD(cents: number): string {
  const dollars = cents / 100;
  return `HK$${dollars.toLocaleString("en-HK", {
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
