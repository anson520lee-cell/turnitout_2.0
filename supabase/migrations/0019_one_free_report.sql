-- One free full report per account, ever (was: one a day).
--
-- The free report is still an ordinary order with a price of 0 that goes
-- through the same report pipeline as a paid one. Only the allowance changes:
-- the per-account count now lives in a single lifetime row instead of one row
-- per Hong Kong day. The per-network-address guard is unchanged (a daily cap on
-- how many free reports one address can hand out, against throw-away accounts).
--
-- The lifetime row is stored in public.free_report_usage under a fixed date
-- (1970-01-01), so the table, its primary key and the claims table stay as they
-- were and the function signatures are unchanged: the previous app version keeps
-- working while this is rolled out. Keep the account limit (1) in sync with
-- config/app.ts freeReport.perUserLimit.

-- Accounts that already took a free report on any earlier day have used theirs.
-- A report that was refunded (it could not be made) leaves used = 0 and does not count.
insert into public.free_report_usage as f (kind, subject, usage_date, used)
select 'user', subject, date '1970-01-01', 1
  from public.free_report_usage
 where kind = 'user' and used >= 1 and usage_date <> date '1970-01-01'
 group by subject
on conflict (kind, subject, usage_date)
do update set used = greatest(f.used, 1), updated_at = now();

-- Takes the account's free report for an order. Returns 0 when taken, -1 when
-- the account has already had its free report, -2 when this network address
-- has used up its share (p_ip_limit) today.
create or replace function public.consume_free_report(p_order uuid, p_user uuid, p_ip_hash text, p_ip_limit integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Hong_Kong')::date;
  v_forever date := date '1970-01-01';
  v_used integer;
begin
  insert into public.free_report_usage as f (kind, subject, usage_date, used)
  values ('user', p_user::text, v_forever, 1)
  on conflict (kind, subject, usage_date)
  do update set used = f.used + 1, updated_at = now() where f.used < 1
  returning f.used into v_used;
  if v_used is null then return -1; end if;

  v_used := null;
  insert into public.free_report_usage as f (kind, subject, usage_date, used)
  values ('ip', p_ip_hash, v_today, 1)
  on conflict (kind, subject, usage_date)
  do update set used = f.used + 1, updated_at = now() where f.used < p_ip_limit
  returning f.used into v_used;
  if v_used is null then
    update public.free_report_usage set used = greatest(used - 1, 0), updated_at = now()
     where kind = 'user' and subject = p_user::text and usage_date = v_forever;
    return -2;
  end if;

  insert into public.free_report_claims (order_id, user_id, ip_hash, usage_date)
  values (p_order, p_user, p_ip_hash, v_today);
  return 0;
end $$;

-- Gives the allowance back (the report failed or the order was never made). Safe to call twice.
create or replace function public.refund_free_report(p_order uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare c public.free_report_claims;
begin
  update public.free_report_claims set refunded = true
   where order_id = p_order and not refunded
  returning * into c;
  if c.order_id is null then return false; end if;
  update public.free_report_usage set used = greatest(used - 1, 0), updated_at = now()
   where kind = 'user' and subject = c.user_id::text and usage_date = date '1970-01-01';
  update public.free_report_usage set used = greatest(used - 1, 0), updated_at = now()
   where kind = 'ip' and subject = c.ip_hash and usage_date = c.usage_date;
  return true;
end $$;

-- Free reports left for this account (0 or 1), also 0 when the address is used up today.
create or replace function public.free_report_remaining(p_user uuid, p_ip_hash text, p_ip_limit integer)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0, least(
    1 - coalesce((select used from public.free_report_usage
                   where kind = 'user' and subject = p_user::text
                     and usage_date = date '1970-01-01'), 0),
    p_ip_limit - coalesce((select used from public.free_report_usage
                   where kind = 'ip' and subject = p_ip_hash
                     and usage_date = (now() at time zone 'Asia/Hong_Kong')::date), 0)
  ));
$$;

-- Same grants as before: only the server (service role) may call these.
revoke all on function public.consume_free_report(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.refund_free_report(uuid) from public, anon, authenticated;
revoke all on function public.free_report_remaining(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_free_report(uuid, uuid, text, integer) to service_role;
grant execute on function public.refund_free_report(uuid) to service_role;
grant execute on function public.free_report_remaining(uuid, text, integer) to service_role;
