-- Crypto payments through NOWPayments (USDT, USDC, BTC). Apply after 0007.
-- A crypto payment is the "how it was paid" detail of a normal credit top-up
-- (credit_topups, method = 'nowpayments'); credits are added by the existing
-- credit_confirm_topup() function, so there is one ledger and one place where
-- a balance can change. Browsers can only READ these rows; only the service
-- role (server code, after a signature-checked webhook) writes them.

create table public.crypto_payments (
  id uuid primary key default gen_random_uuid(),
  -- The id we send to NOWPayments as order_id (the top-up id).
  order_id text not null unique,
  topup_id uuid not null unique references public.credit_topups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  usd integer not null check (usd between 1 and 100000),
  fiat_currency text not null default 'usd',
  -- NOWPayments ticker, e.g. btc, usdttrc20, usdcerc20.
  pay_currency text not null,
  network text,
  pay_amount numeric(38, 12),
  actually_paid numeric(38, 12),
  pay_address text,
  np_payment_id text unique,
  status text not null default 'waiting'
    check (status in ('waiting', 'confirming', 'confirmed', 'sending', 'finished',
                      'partially_paid', 'failed', 'refunded', 'expired')),
  tx_hash text,
  expires_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index crypto_payments_user on public.crypto_payments (user_id, created_at desc);
create index crypto_payments_open on public.crypto_payments (created_at)
  where status in ('waiting', 'confirming', 'partially_paid');

-- One row per distinct webhook delivery that was processed (hash of the body).
create table public.crypto_webhook_events (
  id uuid primary key default gen_random_uuid(),
  body_hash text not null unique,
  np_payment_id text,
  status text,
  outcome text,
  received_at timestamptz not null default now()
);

alter table public.crypto_payments enable row level security;
alter table public.crypto_webhook_events enable row level security;
create policy "own crypto payments read" on public.crypto_payments
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- No other policies: crypto_webhook_events is service-role only.
