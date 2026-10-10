-- One row per model call: what it cost and how it went. No text, no user id.
create table if not exists public.model_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  purpose text not null,
  model text not null,
  effort text not null,
  ok boolean not null,
  reason text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  cache_hit_tokens integer not null default 0,
  ms integer not null default 0
);
create index if not exists model_usage_created_at_idx on public.model_usage (created_at desc);
alter table public.model_usage enable row level security;
revoke all on table public.model_usage from public, anon, authenticated;

-- Every saved version of an owner-edited setting (e.g. the report prompt), newest first.
create table if not exists public.site_setting_history (
  id bigint generated always as identity primary key,
  key text not null,
  value text not null,
  saved_at timestamptz not null default now(),
  saved_by uuid references auth.users (id) on delete set null
);
create index if not exists site_setting_history_key_idx on public.site_setting_history (key, saved_at desc);
alter table public.site_setting_history enable row level security;
revoke all on table public.site_setting_history from public, anon, authenticated;
