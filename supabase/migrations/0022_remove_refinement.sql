-- Writing Refinement was removed on 2026-10-26. Everyone who paid for a
-- refinement order gets its price back as credits, and every refinement order
-- that was not delivered is cancelled. Nothing is deleted.
--
-- Safe to run more than once: an order that already has a "Refund: Writing
-- Refinement removed" ledger row is never refunded again, and only orders that
-- are still open are cancelled. Orders paid by the admin's free test payment
-- (or the dev payment) cost nothing, so they get nothing back. Apply after 0021.

do $$
declare
  r record;
  v_note constant text := 'Refund: Writing Refinement removed';
begin
  for r in
    select o.id, o.user_id, o.price
      from public.orders o
     where o.service_type = 'refinement'
       and o.paid_at is not null
       and exists (
         select 1 from public.payments p
          where p.order_id = o.id and p.status = 'succeeded'
            and p.provider not in ('admin_free', 'dev')
       )
       and not exists (
         select 1 from public.credit_transactions t
          where t.order_id = o.id and t.kind = 'refund' and t.note = v_note
       )
  loop
    perform public.credit_add(r.user_id, round(r.price / 100.0)::integer, 'refund', r.id, null, v_note);
    insert into public.audit_events (order_id, event, detail)
    values (r.id, 'refinement_refunded', jsonb_build_object('credits', round(r.price / 100.0)::integer, 'reason', 'Writing Refinement removed'));
  end loop;

  with closed as (
    update public.orders
       set status = 'cancelled', cancelled_at = now(), updated_at = now()
     where service_type = 'refinement'
       and status not in ('completed', 'cancelled')
    returning id
  )
  insert into public.audit_events (order_id, event, detail)
  select id, 'order_cancelled', jsonb_build_object('reason', 'Writing Refinement removed') from closed;
end $$;
