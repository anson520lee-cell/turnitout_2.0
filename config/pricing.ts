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

export const screeningPrices: Record<ScreeningServiceType, number> = {
  ai_screening: 8800,
  similarity_screening: 8800,
  combined_screening: 12800,
};

/**
 * Writing refinement is priced per word with a minimum charge.
 * price = max(minimum, ceil(words / blockWords) * perBlock)
 */
export const refinementPricing = {
  minimum: 6800,
  blockWords: 100,
  perBlock: 2800,
} as const;

export function screeningPrice(type: ScreeningServiceType): number {
  return screeningPrices[type];
}

export function refinementPrice(words: number): number {
  const blocks = Math.max(1, Math.ceil(words / refinementPricing.blockWords));
  return Math.max(refinementPricing.minimum, blocks * refinementPricing.perBlock);
}

export function formatHKD(cents: number): string {
  const dollars = cents / 100;
  return `HK$${dollars.toLocaleString("en-HK", {
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
