-- Daily free full report: every account gets one free automatic report a day
-- (up to 4,000 characters), on top of the free scans. It is an ordinary order
-- with a price of 0 that goes through the same report pipeline as a paid one.
-- The day is the Hong Kong calendar day, like the free scan.

-- A free report is a real order with price 0.
alter table public.orders drop constraint if exists orders_price_check;
alter table public.orders add constraint orders_price_check check (price >= 0);

-- How many free reports an account (and, as a second guard against throw-away
-- accounts, one network address) has used on a day. Only the server touches it.
create table if not exists public.free_report_usage (
  kind text not null check (kind in ('user', 'ip')),
  subject text not null check (char_length(subject) between 1 and 100),
  usage_date date not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (kind, subject, usage_date)
);
alter table public.free_report_usage enable row level security;
revoke all on table public.free_report_usage from public, anon, authenticated;

-- Which order used which allowance, so a report that could not be made gives it back.
create table if not exists public.free_report_claims (
  order_id uuid primary key references public.orders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  ip_hash text not null,
  usage_date date not null,
  refunded boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.free_report_claims enable row level security;
revoke all on table public.free_report_claims from public, anon, authenticated;

-- Takes today's free report for an order. Returns 0 when taken, -1 when the
-- account has already used today's, -2 when this network address has used up
-- its share (p_ip_limit) today. Keep the account limit (1) in sync with
-- config/app.ts freeReport.dailyLimit.
create or replace function public.consume_free_report(p_order uuid, p_user uuid, p_ip_hash text, p_ip_limit integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Hong_Kong')::date;
  v_used integer;
begin
  insert into public.free_report_usage as f (kind, subject, usage_date, used)
  values ('user', p_user::text, v_today, 1)
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
     where kind = 'user' and subject = p_user::text and usage_date = v_today;
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
   where kind = 'user' and subject = c.user_id::text and usage_date = c.usage_date;
  update public.free_report_usage set used = greatest(used - 1, 0), updated_at = now()
   where kind = 'ip' and subject = c.ip_hash and usage_date = c.usage_date;
  return true;
end $$;

-- Free reports left today for this account (0 or 1), also 0 when the address is used up.
create or replace function public.free_report_remaining(p_user uuid, p_ip_hash text, p_ip_limit integer)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0, least(
    1 - coalesce((select used from public.free_report_usage
                   where kind = 'user' and subject = p_user::text
                     and usage_date = (now() at time zone 'Asia/Hong_Kong')::date), 0),
    p_ip_limit - coalesce((select used from public.free_report_usage
                   where kind = 'ip' and subject = p_ip_hash
                     and usage_date = (now() at time zone 'Asia/Hong_Kong')::date), 0)
  ));
$$;

revoke all on function public.consume_free_report(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.refund_free_report(uuid) from public, anon, authenticated;
revoke all on function public.free_report_remaining(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_free_report(uuid, uuid, text, integer) to service_role;
grant execute on function public.refund_free_report(uuid) to service_role;
grant execute on function public.free_report_remaining(uuid, text, integer) to service_role;
