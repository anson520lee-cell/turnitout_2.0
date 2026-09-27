-- Proofline initial schema
-- Run with `supabase db push` or paste into the Supabase SQL editor.
-- Everything the app relies on (tables, constraints, RLS, storage buckets and
-- storage policies) is defined here; nothing needs clicking in the dashboard.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('user', 'admin');

create type public.service_type as enum (
  'refinement', 'ai_screening', 'similarity_screening', 'combined_screening'
);

create type public.order_status as enum (
  'awaiting_payment', 'paid', 'queued', 'under_review', 'processing',
  'screening', 'report_ready', 'completed', 'cancelled'
);

create type public.risk_level as enum ('low', 'moderate', 'elevated');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text check (char_length(display_name) <= 80),
  role public.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role is never writable by the user. Promote admins with:
--   update public.profiles set role = 'admin' where email = 'you@example.com';
-- from the SQL editor (runs as postgres).
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if (new.role is distinct from old.role or new.email is distinct from old.email)
     and coalesce(auth.role(), '') not in ('service_role')
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'role and email cannot be changed here';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- Free scan usage (3 per calendar day, Asia/Hong_Kong)
-- ---------------------------------------------------------------------------
create table public.scan_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  usage_date date not null,
  scan_count integer not null default 0 check (scan_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, usage_date)
);

-- Atomically consumes one scan for the calling user. Returns the number of
-- scans remaining after this one, or -1 when the daily limit is reached.
-- The single INSERT .. ON CONFLICT .. WHERE is race-safe under concurrency.
create or replace function public.consume_scan()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_limit constant integer := 3; -- keep in sync with config/app.ts freeScan.dailyLimit
  v_today date := (now() at time zone 'Asia/Hong_Kong')::date;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.scan_usage as su (user_id, usage_date, scan_count)
  values (auth.uid(), v_today, 1)
  on conflict (user_id, usage_date)
  do update set scan_count = su.scan_count + 1, updated_at = now()
    where su.scan_count < v_limit
  returning su.scan_count into v_count;

  if v_count is null then
    return -1;
  end if;
  return v_limit - v_count;
end $$;

-- Gives one scan back when analysis fails after consuming. Server-only
-- (service role): if users could call it, they could refund themselves forever.
create or replace function public.refund_scan(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.scan_usage
     set scan_count = greatest(scan_count - 1, 0), updated_at = now()
   where user_id = p_user
     and usage_date = (now() at time zone 'Asia/Hong_Kong')::date;
end $$;

create or replace function public.remaining_scans()
returns integer language sql stable security definer set search_path = public as $$
  select 3 - coalesce((
    select scan_count from public.scan_usage
     where user_id = auth.uid()
       and usage_date = (now() at time zone 'Asia/Hong_Kong')::date
  ), 0);
$$;

revoke all on function public.consume_scan() from public, anon;
revoke all on function public.refund_scan(uuid) from public, anon, authenticated;
revoke all on function public.remaining_scans() from public, anon;
grant execute on function public.consume_scan() to authenticated;
grant execute on function public.refund_scan(uuid) to service_role;
grant execute on function public.remaining_scans() to authenticated;

-- ---------------------------------------------------------------------------
-- Scan results
-- ---------------------------------------------------------------------------
create table public.scan_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  input_text text, -- null unless retention.storeScanText is enabled
  word_count integer not null,
  overall_risk public.risk_level not null,
  result_json jsonb not null,
  analyzer text not null,
  created_at timestamptz not null default now()
);
create index scan_results_user_created on public.scan_results (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  service_type public.service_type not null,
  status public.order_status not null default 'awaiting_payment',
  title text not null check (char_length(title) between 1 and 200),
  price integer not null check (price > 0),
  currency text not null default 'hkd',
  word_count integer check (word_count >= 0),
  instructions text check (char_length(instructions) <= 1000),
  source_text text, -- refinement only
  integrity_confirmed boolean not null default false check (integrity_confirmed),
  admin_checklist jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  source_deleted_at timestamptz
);
create index orders_user_created on public.orders (user_id, created_at desc);
create index orders_status on public.orders (status, created_at);

create table public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size integer not null check (file_size > 0),
  -- Set once the server has checked the stored object's real type and size.
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index order_files_order on public.order_files (order_id);

create table public.screening_results (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  provider text not null default 'turnitin',
  -- Only populated when the screening actually returned a value. Never inferred.
  ai_indicator numeric(5, 2) check (ai_indicator between 0 and 100),
  ai_indicator_note text, -- e.g. "Not returned: document below minimum length"
  similarity_percentage numeric(5, 2) check (similarity_percentage between 0 and 100),
  screening_completed_at timestamptz,
  report_storage_path text,
  report_file_name text,
  result_metadata jsonb not null default '{}'::jsonb,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.refinement_results (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  revised_text text not null,
  reviewer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null,
  provider_payment_id text not null,
  amount integer not null,
  currency text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index payments_order on public.payments (order_id);

create table public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index admin_notes_order on public.admin_notes (order_id, created_at);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_order on public.audit_events (order_id, created_at);

-- ---------------------------------------------------------------------------
-- Row level security
-- Writes to orders, files, results and payments happen only on the server
-- with the service role, after the server has checked auth and recomputed
-- prices. The browser gets read access to its own rows only.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.scan_usage enable row level security;
alter table public.scan_results enable row level security;
alter table public.orders enable row level security;
alter table public.order_files enable row level security;
alter table public.screening_results enable row level security;
alter table public.refinement_results enable row level security;
alter table public.payments enable row level security;
alter table public.admin_notes enable row level security;
alter table public.audit_events enable row level security;

create policy "own profile read" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "own profile update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "own usage read" on public.scan_usage
  for select using (user_id = auth.uid() or public.is_admin());

create policy "own scans read" on public.scan_results
  for select using (user_id = auth.uid() or public.is_admin());
create policy "own scans insert" on public.scan_results
  for insert with check (user_id = auth.uid());
create policy "own scans delete" on public.scan_results
  for delete using (user_id = auth.uid());

create policy "own orders read" on public.orders
  for select using (user_id = auth.uid() or public.is_admin());

create policy "own files read" on public.order_files
  for select using (
    public.is_admin() or exists (
      select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()
    )
  );

-- Results become visible to the customer only once the order is completed.
create policy "own completed screening read" on public.screening_results
  for select using (
    public.is_admin() or exists (
      select 1 from public.orders o
       where o.id = order_id and o.user_id = auth.uid() and o.status = 'completed'
    )
  );

create policy "own completed refinement read" on public.refinement_results
  for select using (
    public.is_admin() or exists (
      select 1 from public.orders o
       where o.id = order_id and o.user_id = auth.uid() and o.status = 'completed'
    )
  );

create policy "own payments read" on public.payments
  for select using (
    public.is_admin() or exists (
      select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()
    )
  );

create policy "admin notes" on public.admin_notes
  for select using (public.is_admin());

create policy "admin audit" on public.audit_events
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: two private buckets. No public URLs. Users never read storage
-- directly; the server issues short-lived signed URLs after checking access.
-- Uploads use server-issued signed upload URLs scoped to one path.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 20971520, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  ('reports', 'reports', false, 31457280, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Admins may browse both buckets from the dashboard; nobody else gets a policy.
create policy "admin read documents" on storage.objects
  for select using (bucket_id in ('documents', 'reports') and public.is_admin());
