-- Suggested rewrites of the sentences a finished report flagged ("Fix flagged phrasing, keep your meaning").
-- One set per report, made once (lib/auto-report/rewrite-run.ts). The lease keeps two requests from making it at the
-- same time. Written only by the server; customers read through the server. Nothing existing changes. Apply after 0022.
alter table public.auto_reports add column if not exists rewrite jsonb;
alter table public.auto_reports add column if not exists rewrite_lease timestamptz;
