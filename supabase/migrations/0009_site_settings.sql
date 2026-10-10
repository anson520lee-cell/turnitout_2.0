-- Owner-editable site settings (for now: the system prompt behind the free-scan
-- report). Read and written only by the server with the service role, after it
-- has checked that the caller is an admin, so RLS is on with no policies.

create table if not exists public.site_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.site_settings enable row level security;

revoke all on table public.site_settings from public, anon, authenticated;
