-- Background queue for the prompt backtest (admin only): a row says "run this prompt on every sample piece that has
-- no answer yet for this batch". A small scheduled job picks rows up and runs them, so nobody has to press Start.
-- Rows can only be added with the service key (the Supabase SQL editor or the server), never from the website.
create table if not exists public.chunk_queue (
  id uuid primary key default gen_random_uuid(),
  batch text not null check (char_length(batch) between 1 and 60),
  prompt_name text not null check (prompt_name in ('strict1', 'slip1', 'struct1', 'mix1')),
  effort text,
  sizes integer[] not null default '{3000}',
  min_chars integer not null default 3000,
  -- Most model calls this run may ever make (retries of failed pieces count). A run that reaches it stops.
  max_pieces integer not null default 150 check (max_pieces between 1 and 400),
  attempted integer not null default 0,
  ok_pieces integer not null default 0,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'stopped')),
  lease_until timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.chunk_queue enable row level security;
revoke all on table public.chunk_queue from public, anon, authenticated;
