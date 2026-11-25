-- Keep the existing minute schedule, but check for work in Postgres before
-- invoking the Vercel function. The existing HTTP call stays in pg_cron.
do $migration$
declare
  runner_id bigint;
  http_call text;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  select jobid, rtrim(command, E'; \n\r\t')
    into runner_id, http_call
    from cron.job
    where jobname = 'chunk-queue-runner';

  if runner_id is null or http_call like '%/* chunk_queue_idle_guard */%' then
    return;
  end if;

  if http_call !~* '^[[:space:]]*select[[:space:]]+net[.]http_post[[:space:]]*[(]' then
    raise exception 'The chunk-queue-runner command does not match the expected HTTP call';
  end if;

  perform cron.alter_job(runner_id, command := format($job$
    /* chunk_queue_idle_guard */
    select case when
      exists (
        select 1
        from public.orders o
        left join public.auto_reports a on a.order_id = o.id
        where o.status in ('paid', 'queued', 'screening')
          and o.service_type <> 'refinement'
          and o.source_text is not null
          and o.updated_at < now() - interval '90 seconds'
          and (
            a.order_id is null
            or (a.status = 'running'
              and a.updated_at < now() - interval '90 seconds'
              and (a.lease_until is null or a.lease_until < now()))
          )
      )
      or exists (
        -- Use the same window as the background runner. That runner decides
        -- whether a recent rewrite has another step or has already finished.
        select 1
        from public.auto_reports a
        where a.status = 'done'
          and a.rewrite is not null
          and a.rewrite->>'createdAt' >= to_char(
            (now() - interval '45 minutes') at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
          and (a.rewrite_lease is null or a.rewrite_lease < now())
      )
      or exists (
        select 1 from public.chunk_queue
        where status in ('queued', 'running')
          and (lease_until is null or lease_until < now())
      )
      then (%s)
    end;
  $job$, http_call));
end
$migration$;
