-- An order can now be paid directly by Alipay (no credits): the customer enters
-- the Alipay transaction number for that one order. As with top-ups (0019), the
-- same number must never be claimed twice while a claim is waiting or already
-- confirmed, or one transfer could pay for two orders. Rejected claims are left
-- out so the customer can resend a corrected number. The app checks this first
-- (across top-ups and orders) and shows a friendly message; this index is the
-- guarantee when two requests arrive at the same moment. The site works the same
-- without it, only without that last guard.
create unique index if not exists payment_claims_reference
  on public.payment_claims (method, lower(payer_reference))
  where status in ('pending', 'confirmed');
