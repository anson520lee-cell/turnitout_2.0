-- Guest free scans (3 per IP per day) and manual payments (Alipay, PayMe,
-- bank transfer). Apply after 0001_init.sql.

-- ---------------------------------------------------------------------------
-- Guest scan usage. Keyed by a salted SHA-256 of the visitor's IP address,
-- never the raw IP. Only the server (service role) can read or write it.
-- ---------------------------------------------------------------------------
create table public.guest_scan_usage (
  ip_hash text not null check (char_length(ip_hash) = 64),
  usage_date date not null,
  scan_count integer not null default 0 check (scan_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (ip_hash, usage_date)
);
alter table public.guest_scan_usage enable row level security;
-- No policies: only the service role (which bypasses RLS) touches this table.

create or replace function public.consume_guest_scan(p_ip_hash text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_limit constant integer := 3; -- keep in sync with config/app.ts freeScan.dailyLimit
  v_today date := (now() at time zone 'Asia/Hong_Kong')::date;
  v_count integer;
begin
  insert into public.guest_scan_usage as g (ip_hash, usage_date, scan_count)
  values (p_ip_hash, v_today, 1)
  on conflict (ip_hash, usage_date)
  do update set scan_count = g.scan_count + 1, updated_at = now()
    where g.scan_count < v_limit
  returning g.scan_count into v_count;

  if v_count is null then
    return -1;
  end if;
  return v_limit - v_count;
end $$;

create or replace function public.refund_guest_scan(p_ip_hash text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.guest_scan_usage
     set scan_count = greatest(scan_count - 1, 0), updated_at = now()
   where ip_hash = p_ip_hash
     and usage_date = (now() at time zone 'Asia/Hong_Kong')::date;
end $$;

create or replace function public.guest_remaining_scans(p_ip_hash text)
returns integer language sql stable security definer set search_path = public as $$
  select 3 - coalesce((
    select scan_count from public.guest_scan_usage
     where ip_hash = p_ip_hash
       and usage_date = (now() at time zone 'Asia/Hong_Kong')::date
  ), 0);
$$;

revoke all on function public.consume_guest_scan(text) from public, anon, authenticated;
revoke all on function public.refund_guest_scan(text) from public, anon, authenticated;
revoke all on function public.guest_remaining_scans(text) from public, anon, authenticated;
grant execute on function public.consume_guest_scan(text) to service_role;
grant execute on function public.refund_guest_scan(text) to service_role;
grant execute on function public.guest_remaining_scans(text) to service_role;

-- Old guest rows are useless after the day ends; the retention cron clears them.

-- ---------------------------------------------------------------------------
-- Manual payment claims. The customer pays by Alipay, PayMe or bank
-- transfer outside the site, then tells us the reference. An admin checks
-- the account and confirms; only then is the order marked paid.
-- ---------------------------------------------------------------------------
create table public.payment_claims (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  method text not null check (method in ('alipay', 'payme', 'bank_transfer')),
  payer_reference text not null check (char_length(payer_reference) between 1 and 200),
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  admin_note text check (char_length(admin_note) <= 500),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index payment_claims_order on public.payment_claims (order_id, created_at desc);
create index payment_claims_pending on public.payment_claims (created_at) where status = 'pending';
-- One open claim per order at a time.
create unique index payment_claims_one_pending on public.payment_claims (order_id) where status = 'pending';

alter table public.payment_claims enable row level security;
create policy "own claims read" on public.payment_claims
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- Inserts and reviews happen in server actions with the service role.
