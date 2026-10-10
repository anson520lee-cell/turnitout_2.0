-- A written report the user chose to keep with a scan. Opt-in, own rows only, deleted with the scan
-- (or after retention.savedReportDays by the retention job).
alter table public.scan_results
  add column if not exists report_text text,
  add column if not exists report_saved_at timestamptz;

-- The owner of a scan may change only the report columns (not scores or text).
revoke update on table public.scan_results from authenticated;
grant update (report_text, report_saved_at) on table public.scan_results to authenticated;

drop policy if exists "own scans update report" on public.scan_results;
create policy "own scans update report" on public.scan_results
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
