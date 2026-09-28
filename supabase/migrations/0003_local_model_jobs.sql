-- Jobs for the owner's local writing model (a model served by Open WebUI on
-- the owner's own computer). A small worker program there
-- (tools/local-model-worker) polls this site for work, runs the model and
-- posts the result back, so the computer never has to accept connections
-- from the internet. Apply after 0002.
--
-- Two kinds of job:
--   scan_feedback     written feedback shown under a free scan. The text sits
--                     here only until the worker claims it (it is cleared at
--                     claim), and the row is deleted once the browser has
--                     fetched the feedback or when it expires (minutes).
--   refinement_draft  a first draft for a paid refinement order. The text is
--                     read from orders.source_text at claim time, never copied
--                     here. The draft waits for an admin to review and edit it;
--                     nothing reaches the customer until the admin saves and
--                     releases their own revision.
--
-- Only the server (service role) touches these tables.

create table public.model_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('scan_feedback', 'refinement_draft')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  order_id uuid references public.orders (id) on delete cascade,
  input_text text,
  output_text text,
  error text check (char_length(error) <= 500),
  attempts integer not null default 0,
  model text check (char_length(model) <= 200),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null,
  -- Drafts belong to an order; scan feedback never does.
  check ((kind = 'refinement_draft') = (order_id is not null)),
  -- Order text is never copied into a draft job.
  check (kind = 'scan_feedback' or input_text is null)
);
create index model_jobs_queue on public.model_jobs (created_at) where status = 'queued';
create index model_jobs_order on public.model_jobs (order_id, created_at desc) where order_id is not null;
create index model_jobs_scan_expiry on public.model_jobs (expires_at) where kind = 'scan_feedback';
-- One draft in progress per order at a time.
create unique index model_jobs_one_open_draft on public.model_jobs (order_id)
  where kind = 'refinement_draft' and status in ('queued', 'running');
alter table public.model_jobs enable row level security;
-- No policies: only the service role (which bypasses RLS) touches this table.

-- When the worker last checked in, so the site only offers scan feedback
-- while the owner's computer is actually on.
create table public.model_worker (
  id boolean primary key default true check (id),
  last_seen_at timestamptz not null default now(),
  model text check (char_length(model) <= 200)
);
alter table public.model_worker enable row level security;

create or replace function public.touch_model_worker(p_model text)
returns void language sql security definer set search_path = public as $$
  insert into public.model_worker (id, last_seen_at, model)
  values (true, now(), left(p_model, 200))
  on conflict (id) do update set last_seen_at = now(), model = excluded.model;
$$;

-- Scan feedback nobody will read any more: the visitor's window has passed.
create or replace function public.purge_model_jobs()
returns void language sql security definer set search_path = public as $$
  delete from public.model_jobs where kind = 'scan_feedback' and expires_at < now();
$$;

-- Hands the worker its next job and marks it running, atomically, so two
-- worker processes can never take the same job. Scan feedback goes first
-- (a visitor is waiting on the page). p_kind limits the claim to one kind;
-- the worker uses it to answer waiting scans between chunks of a long draft.
-- Returns no row when there is nothing to do.
create or replace function public.claim_model_job(p_model text, p_kind text default null)
returns table (job_id uuid, job_kind text, job_order_id uuid, job_input text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_kind text;
  v_order uuid;
  v_input text;
begin
  perform public.touch_model_worker(p_model);
  perform public.purge_model_jobs();

  -- A draft whose worker stopped reporting progress (the computer was shut
  -- down mid-job) goes back in the queue, up to three tries.
  update public.model_jobs j
     set status = case when j.attempts >= 3 then 'failed' else 'queued' end,
         error = case when j.attempts >= 3 then 'The worker stopped responding three times.' else j.error end,
         finished_at = case when j.attempts >= 3 then now() else j.finished_at end
   where j.status = 'running' and j.kind = 'refinement_draft'
     and j.claimed_at < now() - interval '20 minutes';

  -- Drafts nobody picked up in time, or whose order no longer needs one.
  update public.model_jobs j
     set status = 'failed', finished_at = now(),
         error = case when j.expires_at < now() then 'Expired before the worker picked it up.'
                      else 'The order was closed or its text deleted before the draft was written.' end
   where j.status = 'queued' and j.kind = 'refinement_draft'
     and (j.expires_at < now() or not exists (
           select 1 from public.orders o
            where o.id = j.order_id and o.source_text is not null
              and o.status in ('paid', 'queued', 'under_review', 'processing')));

  select j.id, j.kind, j.order_id, j.input_text
    into v_id, v_kind, v_order, v_input
    from public.model_jobs j
   where j.status = 'queued' and j.expires_at > now()
     and (p_kind is null or j.kind = p_kind)
   order by (j.kind = 'scan_feedback') desc, j.created_at
   limit 1
   for update skip locked;
  if v_id is null then
    return;
  end if;

  -- The scanned text leaves the database as it is handed over.
  update public.model_jobs
     set status = 'running', claimed_at = now(), attempts = attempts + 1,
         model = left(p_model, 200), input_text = null
   where id = v_id;

  job_id := v_id;
  job_kind := v_kind;
  job_order_id := v_order;
  job_input := v_input;
  return next;
end $$;

revoke all on function public.touch_model_worker(text) from public, anon, authenticated;
revoke all on function public.purge_model_jobs() from public, anon, authenticated;
revoke all on function public.claim_model_job(text, text) from public, anon, authenticated;
grant execute on function public.touch_model_worker(text) to service_role;
grant execute on function public.purge_model_jobs() to service_role;
grant execute on function public.claim_model_job(text, text) to service_role;
