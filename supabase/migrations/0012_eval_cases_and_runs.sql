-- Accuracy testing of the scan report: essays whose Turnitin result is known (which sentences it flagged),
-- and every run of the reviewer on them. Admin only (service role); no policies.
create table if not exists public.eval_cases (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null,
  -- [{ "p": 1, "s": 2, "flagged": true }, ...] numbered by lib/recheck.splitSentences
  sentences jsonb not null,
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.eval_runs (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.eval_cases (id) on delete cascade,
  created_at timestamptz not null default now(),
  model text not null,
  effort text not null,
  prompt_label text not null,
  prompt_chars integer not null,
  metrics jsonb not null,
  report text not null,
  ms integer not null default 0,
  tokens integer not null default 0
);
create index if not exists eval_runs_case_idx on public.eval_runs (case_id, created_at desc);
alter table public.eval_cases enable row level security;
alter table public.eval_runs enable row level security;
revoke all on table public.eval_cases from public, anon, authenticated;
revoke all on table public.eval_runs from public, anon, authenticated;
