-- Allow the extra manual payment methods (PayPal and crypto) in payment claims.
-- Run this in the Supabase SQL editor (or `supabase db push`) before enabling
-- these methods on the live site; claims by these methods fail until then.
alter table public.payment_claims drop constraint if exists payment_claims_method_check;
alter table public.payment_claims
  add constraint payment_claims_method_check
  check (method in ('alipay', 'payme', 'paypal', 'bank_transfer', 'usdt', 'usdc', 'bitcoin'));
