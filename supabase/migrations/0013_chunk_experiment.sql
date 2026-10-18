-- Chunk-size experiment (admin only): texts with known sentence labels, and the
-- reviewer's answer for each piece of them at each piece size.
create table if not exists public.chunk_samples (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- human: written by a person · ai: written by a model · turnitin: Turnitin's own sentence flags · mixed: human and AI paragraphs joined
  origin text not null check (origin in ('human', 'ai', 'turnitin', 'mixed')),
  body text not null,
  -- [{ "p": 1, "s": 2, "flagged": true }, ...] for every sentence, numbered by lib/recheck.splitSentences
  sentences jsonb not null,
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.chunk_trials (
  id bigint generated always as identity primary key,
  sample_id uuid not null references public.chunk_samples (id) on delete cascade,
  batch text not null,
  size integer not null,
  idx integer not null,
  first_sentence integer not null,
  chunk text not null,
  model text not null,
  effort text not null,
  report text not null default '',
  ok boolean not null,
  truncated boolean not null default false,
  ms integer not null default 0,
  tokens integer not null default 0,
  created_at timestamptz not null default now(),
  unique (sample_id, batch, size, idx)
);
create index if not exists chunk_trials_sample_idx on public.chunk_trials (sample_id);
alter table public.chunk_samples enable row level security;
alter table public.chunk_trials enable row level security;
revoke all on table public.chunk_samples from public, anon, authenticated;
revoke all on table public.chunk_trials from public, anon, authenticated;
