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

export function formatHKD(cents: number): string {
  const dollars = cents / 100;
  return `HK$${dollars.toLocaleString("en-HK", {
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
