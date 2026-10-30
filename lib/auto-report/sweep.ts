import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceAutoReport, type ReportState } from "./run";
import { RESUME_WINDOW_MS, nextStep, resumable, type ReportRewrite } from "./rewrite";
import { makeRound } from "./rewrite-run";
import { checkReportRewrite } from "./rewrite-check";

/*
 * A report is normally moved forward by its order page while the customer has it
 * open. A report that started with nobody watching (the customer closed the page,
 * or the admin confirmed a payment hours later) would otherwise wait until the
 * customer comes back. The database scheduler calls the background runner every
 * minute (app/api/cron/chunk-queue), and it first moves on the oldest such report.
 */

/** How long a report must sit untouched before the background runner takes it over. */
const IDLE_MS = 90_000;

/** Advances the oldest paid report nobody is moving forward. Returns null when there is none. */
export async function advanceIdleReport(): Promise<{ orderId: string; state: ReportState } | null> {
  const db = createAdminClient();
  const cutoff = new Date(Date.now() - IDLE_MS).toISOString();
  const { data: orders } = await db
    .from("orders")
    .select("id,updated_at")
    .in("status", ["paid", "queued", "screening"])
    .neq("service_type", "refinement")
    .not("source_text", "is", null)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(10)
    .returns<{ id: string; updated_at: string }[]>();
  if (!orders?.length) return null;
  const { data: reports } = await db
    .from("auto_reports")
    .select("order_id,status,updated_at,lease_until")
    .in("order_id", orders.map((o) => o.id))
    .returns<{ order_id: string; status: string; updated_at: string; lease_until: string | null }[]>();
  const byOrder = new Map((reports ?? []).map((r) => [r.order_id, r]));
  const now = new Date().toISOString();
  const idle = orders.find((o) => {
    const r = byOrder.get(o.id);
    if (!r) return true; // paid, report not started yet
    return r.status === "running" && r.updated_at < cutoff && (!r.lease_until || r.lease_until < now);
  });
  if (!idle) return null;
  return { orderId: idle.id, state: await advanceAutoReport(idle.id) };
}

/*
 * A Writing Refinement is normally carried on by the customer's page: it re-checks the rewritten text and asks for
 * further rounds, one step after another (components/reports/rewrite-panel.tsx). If the page is gone (tab closed or
 * in the background, phone locked, connection lost) the run would stop where it was: on a real 100% essay it stopped
 * after round 2 of 3. The same background runner finishes it, following nextStep exactly as the page does.
 */

/** How long a rewrite must sit untouched before the runner takes it over. */
const REWRITE_IDLE_MS = 40_000;
/** One run of the runner is a function call of at most 120 s: a step is only started when its usual time still fits. */
const RUN_BUDGET_MS = 105_000;
const STEP_COST_MS = { check: 60_000, round: 25_000 } as const;

/** The last time the page or the runner moved a rewrite on (a round being written is covered by the lease). */
const lastMoved = (r: ReportRewrite) => Date.parse(r.check?.checkedAt ?? r.createdAt);

/** Carries on the most recent unfinished rewrite nobody is working on, as far as one run allows. Null when there is none. */
export async function advanceIdleRewrite(): Promise<{ orderId: string; steps: string[] } | null> {
  const db = createAdminClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const { data: rows } = await db
    .from("auto_reports")
    .select("order_id,rewrite")
    .eq("status", "done")
    .not("rewrite", "is", null)
    .gte("rewrite->>createdAt", new Date(now - RESUME_WINDOW_MS).toISOString())
    .or(`rewrite_lease.is.null,rewrite_lease.lt.${nowIso}`)
    .limit(20)
    .returns<{ order_id: string; rewrite: ReportRewrite }[]>();
  const row = (rows ?? [])
    .filter((r) => resumable(r.rewrite, now) && now - lastMoved(r.rewrite) > REWRITE_IDLE_MS)
    .sort((a, b) => lastMoved(a.rewrite) - lastMoved(b.rewrite))[0];
  if (!row) return null;
  const { data: order } = await db.from("orders").select("user_id").eq("id", row.order_id).maybeSingle<{ user_id: string }>();
  if (!order) return null;

  const started = Date.now();
  const steps: string[] = [];
  let rewrite = row.rewrite;
  for (let i = 0; i < 8; i++) {
    const step = nextStep(rewrite);
    if (!step || Date.now() - started + STEP_COST_MS[step.kind] > RUN_BUDGET_MS) break;
    const out = step.kind === "check" ? await checkReportRewrite(row.order_id, order.user_id) : await makeRound(row.order_id);
    if (!out.ok) {
      // The model could not be reached: count it, so a rewrite that keeps failing is not tried every minute forever.
      if (out.reason === "unavailable") {
        const { data: now2 } = await db.from("auto_reports").select("rewrite").eq("order_id", row.order_id).maybeSingle<{ rewrite: ReportRewrite | null }>();
        if (now2?.rewrite) await db.from("auto_reports").update({ rewrite: { ...now2.rewrite, stalls: (now2.rewrite.stalls ?? 0) + 1 } }).eq("order_id", row.order_id);
      }
      break;
    }
    steps.push(`${step.kind} ${step.round}`);
    rewrite = out.rewrite;
  }
  return { orderId: row.order_id, steps };
}

