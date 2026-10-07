-- Credits. Customers top up credits (1 credit = HK$1) and spend them on
-- reports and refinements. Balances live in their own table that users can
-- only READ: every change goes through the security-definer functions below,
-- which only the service role may call. Apply after 0005.

create table public.credit_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  kind text not null check (kind in ('topup', 'spend', 'refund', 'adjustment')),
  order_id uuid references public.orders (id) on delete set null,
  topup_id uuid,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index credit_transactions_user on public.credit_transactions (user_id, created_at desc);

-- A top-up request. `amount` is in credits (= HK$). Card payments arrive as
-- 'awaiting_payment' and are confirmed by the signed Stripe webhook; manual
-- payments (Alipay, PayMe, PayPal, bank, crypto) arrive as 'pending' once the
-- customer reports their payment, and an admin confirms them.
create table public.credit_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount between 1 and 100000),
  method text not null,
  status text not null default 'pending'
    check (status in ('awaiting_payment', 'pending', 'confirmed', 'rejected', 'cancelled')),
  payer_reference text check (char_length(payer_reference) <= 200),
  provider_payment_id text,
  admin_note text check (char_length(admin_note) <= 500),
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index credit_topups_user on public.credit_topups (user_id, created_at desc);
create index credit_topups_pending on public.credit_topups (created_at) where status = 'pending';
create unique index credit_topups_provider_payment on public.credit_topups (provider_payment_id)
  where provider_payment_id is not null;

alter table public.credit_accounts enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.credit_topups enable row level security;
create policy "own credit account read" on public.credit_accounts
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "own credit transactions read" on public.credit_transactions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "own topups read" on public.credit_topups
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- No insert/update/delete policies: only the service role writes.

-- Adds credits and writes the ledger row. Returns the new balance.
create or replace function public.credit_add(
  p_user uuid, p_amount integer, p_kind text, p_order uuid, p_topup uuid, p_note text
) returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  insert into public.credit_accounts as a (user_id, balance)
  values (p_user, p_amount)
  on conflict (user_id) do update set balance = a.balance + p_amount, updated_at = now()
  returning balance into v_balance;
  insert into public.credit_transactions (user_id, delta, balance_after, kind, order_id, topup_id, note)
  values (p_user, p_amount, v_balance, p_kind, p_order, p_topup, left(p_note, 200));
  return v_balance;
end $$;

-- Spends credits if (and only if) the balance covers them. Returns the ledger
-- row id, or null when the balance is too low.
create or replace function public.credit_spend(
  p_user uuid, p_amount integer, p_order uuid, p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_balance integer; v_tx uuid;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  update public.credit_accounts
     set balance = balance - p_amount, updated_at = now()
   where user_id = p_user and balance >= p_amount
  returning balance into v_balance;
  if not found then return null; end if;
  insert into public.credit_transactions (user_id, delta, balance_after, kind, order_id, note)
  values (p_user, -p_amount, v_balance, 'spend', p_order, left(p_note, 200))
  returning id into v_tx;
  return v_tx;
end $$;

-- Admin adjustment (positive or negative). Returns the new balance, or -1 if a
-- deduction would take the balance below zero.
create or replace function public.credit_adjust(p_user uuid, p_delta integer, p_note text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if p_delta = 0 then raise exception 'delta must not be zero'; end if;
  if p_delta > 0 then
    return public.credit_add(p_user, p_delta, 'adjustment', null, null, p_note);
  end if;
  update public.credit_accounts
     set balance = balance + p_delta, updated_at = now()
   where user_id = p_user and balance + p_delta >= 0
  returning balance into v_balance;
  if not found then return -1; end if;
  insert into public.credit_transactions (user_id, delta, balance_after, kind, note)
  values (p_user, p_delta, v_balance, 'adjustment', left(p_note, 200));
  return v_balance;
end $$;

-- Confirms a top-up and credits the account in ONE transaction. Safe to call
-- twice: the second call finds the top-up already confirmed and returns -1.
create or replace function public.credit_confirm_topup(
  p_topup uuid, p_reviewer uuid, p_provider_ref text
) returns integer language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_amount integer; v_balance integer;
begin
  update public.credit_topups
     set status = 'confirmed', confirmed_at = now(), reviewed_by = p_reviewer,
         provider_payment_id = coalesce(p_provider_ref, provider_payment_id)
   where id = p_topup and status in ('awaiting_payment', 'pending')
  returning user_id, amount into v_user, v_amount;
  if not found then return -1; end if;
  v_balance := public.credit_add(v_user, v_amount, 'topup', null, p_topup, 'Top-up');
  return v_balance;
end $$;

revoke all on function public.credit_add(uuid, integer, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.credit_spend(uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.credit_adjust(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.credit_confirm_topup(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.credit_add(uuid, integer, text, uuid, uuid, text) to service_role;
grant execute on function public.credit_spend(uuid, integer, uuid, text) to service_role;
grant execute on function public.credit_adjust(uuid, integer, text) to service_role;
grant execute on function public.credit_confirm_topup(uuid, uuid, text) to service_role;
