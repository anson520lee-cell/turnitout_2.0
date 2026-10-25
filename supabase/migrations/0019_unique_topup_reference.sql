-- A hand-confirmed payment (PayPal, Alipay) is reported with the transfer's own
-- reference number. The same reference must never be claimed twice while a claim
-- is waiting or already confirmed, or one transfer could be credited twice (a
-- double click, a retry). Rejected claims are left out so the customer can send a
-- corrected reference. The app checks this first and shows a friendly message;
-- this index is the guarantee when two requests arrive at the same moment.
create unique index if not exists credit_topups_claim_reference
  on public.credit_topups (method, lower(payer_reference))
  where payer_reference is not null and status in ('pending', 'confirmed');
