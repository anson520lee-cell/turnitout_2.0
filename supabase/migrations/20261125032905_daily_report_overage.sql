-- Record the daily allowance on the order so checkout can reprice the same text.
alter table public.orders add column daily_free_chars integer not null default 0
  check (daily_free_chars >= 0);

-- The server validates the input and calculates the quote. Claim and insert in
-- one transaction so a losing request never creates a payable discounted order.
create function public.create_daily_overage_order(
  p_user uuid, p_text text, p_words integer, p_title text, p_price integer,
  p_free_chars integer, p_ip_hash text, p_ip_limit integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order uuid;
  v_result integer;
begin
  if p_price <= 0 or p_free_chars <= 0 then
    raise exception 'Expected a positive overage price and allowance';
  end if;
  insert into public.orders (user_id, service_type, title, source_text, word_count, price, daily_free_chars, integrity_confirmed)
    values (p_user, 'combined_screening', p_title, p_text, p_words, p_price, p_free_chars, true)
    returning id into v_order;
  if not exists (select 1 from public.profiles where id = p_user and role = 'admin') then
    v_result := public.consume_free_report(v_order, p_user, p_ip_hash, p_ip_limit);
    if v_result = -1 then raise exception 'Daily account allowance used' using errcode = 'P4001'; end if;
    if v_result = -2 then raise exception 'Daily network allowance used' using errcode = 'P4002'; end if;
    if v_result is distinct from 0 then raise exception 'Unexpected allowance result'; end if;
  end if;
  return jsonb_build_object('id', v_order);
end $$;
revoke all on function public.create_daily_overage_order(uuid,text,integer,text,integer,integer,text,integer) from public, anon, authenticated;
grant execute on function public.create_daily_overage_order(uuid,text,integer,text,integer,integer,text,integer) to service_role;

create function public.release_unpaid_overage_allowance()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform public.refund_free_report(new.id);
  return new;
end $$;
revoke all on function public.release_unpaid_overage_allowance() from public, anon, authenticated;
create trigger release_unpaid_overage_allowance after update of status on public.orders
  for each row when (old.daily_free_chars > 0 and old.status = 'awaiting_payment' and new.status = 'cancelled')
  execute function public.release_unpaid_overage_allowance();
