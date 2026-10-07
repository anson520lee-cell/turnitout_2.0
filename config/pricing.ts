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
 * One Turnitin report (AI indicator and similarity, from one run) is a flat
 * price for any document inside `screeningWordRange`. The three service types
 * are kept for older orders; new orders are always `combined_screening`.
 */
export const screeningPrices: Record<ScreeningServiceType, number> = {
  ai_screening: 3500,
  similarity_screening: 3500,
  combined_screening: 3500,
};

export const screeningWordRange = { min: 450, max: 29000 } as const;

/**
 * Writing refinement is priced per 100 characters (spaces included) with a
 * minimum charge: HK$1 per 100 characters, minimum HK$30 (3,000 characters).
 * price = max(minimum, ceil(chars / blockChars) * perBlock)
 */
export const refinementPricing = {
  minimum: 3000,
  blockChars: 100,
  perBlock: 100,
} as const;

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
 * orders are unchanged): 100 cents = 1 credit, i.e. a report is 35 credits.
 */
export const CENTS_PER_CREDIT = 100;

export function toCredits(cents: number): number {
  return Math.round(cents / CENTS_PER_CREDIT);
}

/** "35 credits" / "1 credit". */
export function formatCredits(cents: number): string {
  const c = toCredits(cents);
  return `${c.toLocaleString("en-HK")} ${c === 1 ? "credit" : "credits"}`;
}

/**
 * Top-ups are bought in US dollars (card, PayPal) or crypto (USDT, USDC, BTC),
 * and credited at a fixed rate that keeps every service price unchanged:
 * US$1 = 7.8 credits (the HK$ peg), so a US$5 top-up is 39 credits, one
 * 35-credit report costs about US$4.49. Change the rate here and nowhere else.
 */
export const CREDITS_PER_USD = 7.8;
export const topUpCurrency = "usd" as const;

/** Whole US dollars. Presets are for every method; custom amounts only for crypto. */
export const topUp = {
  presetsUsd: [5, 20, 100, 200, 500],
  minUsd: 5,
  maxUsd: 10000,
} as const;

export function usdToCredits(usd: number): number {
  return Math.floor(usd * CREDITS_PER_USD + 1e-9);
}

export function formatUSD(usd: number): string {
  return `US$${usd.toLocaleString("en-US")}`;
}

/** Null when `usd` is an allowed whole-dollar top-up amount. */
export function topUpAmountError(usd: number): string | null {
  if (!Number.isInteger(usd)) return "Enter a whole number of US dollars.";
  if (usd < topUp.minUsd) return `The minimum top-up is ${formatUSD(topUp.minUsd)}.`;
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
