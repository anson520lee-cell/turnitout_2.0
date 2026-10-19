-- Automatic paid report: the text is cut into pieces, each piece is reviewed on its
-- own, and the answers are stitched into one report. The pieces are kept so a
-- report that was interrupted carries on where it stopped. The text itself stays
-- in orders.source_text (the pieces are cut from it again), so it is deleted
-- with it. Written only by the server; customers read through the server.
create table if not exists public.auto_reports (
  order_id uuid primary key references public.orders (id) on delete cascade,
  piece_size integer not null,
  total_pieces integer not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  -- Only one request works on a report at a time.
  lease_until timestamptz,
  error text,
  -- The stitched report (lib/auto-report/stitch.ts) once every piece is done.
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.auto_report_pieces (
  order_id uuid not null references public.orders (id) on delete cascade,
  idx integer not null,
  report text not null default '',
  ok boolean not null default false,
  truncated boolean not null default false,
  attempts integer not null default 0,
  ms integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (order_id, idx)
);
alter table public.auto_reports enable row level security;
alter table public.auto_report_pieces enable row level security;
revoke all on table public.auto_reports from public, anon, authenticated;
revoke all on table public.auto_report_pieces from public, anon, authenticated;
