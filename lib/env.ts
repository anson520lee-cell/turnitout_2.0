export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Development-only switch that marks an order paid without Stripe so the admin
 * workflow can be tested locally. Never active in production builds.
 */
export function devPaymentsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_PAYMENTS === "true";
}
