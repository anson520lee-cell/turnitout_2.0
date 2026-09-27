import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import { adminOrderBundle } from "@/lib/data/admin";
import { uuid } from "@/lib/validation/schemas";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { OrderTimeline } from "@/components/orders/order-timeline";
import {
  ChecklistControls,
  NoteForm,
  RefinementResultForm,
  ScreeningResultForm,
  StatusControls,
  WordCountForm,
} from "@/components/admin/order-controls";
import { PaymentClaims } from "@/components/admin/payment-claims";
import { SourceText } from "@/components/admin/source-text";
import { isScreening } from "@/lib/orders/status";
import { serviceLabels } from "@/config/services";
import { billableChars, formatHKD } from "@/config/pricing";
import { paymentMethodLabel, paymentReference } from "@/config/payments";
import { formatBytes, formatDateTime, shortId } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin · Order" };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-2 text-[13px]">
      <dt className="text-fg-subtle">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
}

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const b = await adminOrderBundle(id);
  if (!b) notFound();
  const { order, file, screening, refinement, payments, notes, events, claims } = b;
  const screeningOrder = isScreening(order.service_type);
  const closed = order.status === "completed" || order.status === "cancelled";
  const paid = payments.find((p) => p.status === "succeeded");
  const pendingClaim = claims.some((c) => c.status === "pending");

  return (
    <>
      <Link href="/admin/orders" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg"><ArrowLeft className="size-3.5" /> Orders</Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{order.title}</h1>
          <p className="mt-1 font-mono text-[12px] text-fg-subtle">{order.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{serviceLabels[order.service_type]}</Badge>
          {pendingClaim && <Badge tone="warn" dot>Payment to verify</Badge>}
          <StatusBadge status={order.status} />
        </div>
      </div>

      <Card className="mt-5 p-5"><OrderTimeline type={order.service_type} status={order.status} /></Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.25fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold">Details</h2>
            <dl className="mt-2 divide-y divide-[var(--line)]">
              <Row k="Order ID" v={<span className="font-mono">#{shortId(order.id)}</span>} />
              <Row k="User" v={order.profiles?.display_name || "—"} />
              <Row k="Email" v={order.profiles?.email ?? "—"} />
              <Row k="Service" v={serviceLabels[order.service_type]} />
              {file && <Row k="Filename" v={`${file.file_name} (${formatBytes(file.file_size)})${file.verified ? "" : " · not verified"}`} />}
              <Row k="Word count" v={<WordCountForm orderId={order.id} value={order.word_count} />} />
              {order.source_text && <Row k="Characters" v={billableChars(order.source_text).toLocaleString("en-HK")} />}
              <Row k="Submitted" v={formatDateTime(order.created_at)} />
              <Row k="Price" v={formatHKD(order.price)} />
              <Row k="Pay reference" v={<span className="font-mono">{paymentReference(order.id)}</span>} />
              <Row k="Payment" v={paid ? `${paymentMethodLabel(paid.provider)} · ${formatHKD(paid.amount)} · ${formatDateTime(order.paid_at)}` : pendingClaim ? "Claim waiting for you to verify" : "Not paid"} />
              <Row k="Completed" v={formatDateTime(order.completed_at)} />
              <Row k="User notes" v={<span className="whitespace-pre-wrap text-fg-muted">{order.instructions || "—"}</span>} />
            </dl>
            {screeningOrder && file && (
              <div className="mt-4 border-t border-[var(--line)] pt-4">
                <p className="text-[13px] font-medium">Source file</p>
                {order.source_deleted_at ? (
                  <p className="mt-1 text-[12.5px] text-fg-subtle">Deleted {formatDateTime(order.source_deleted_at)} (retention policy).</p>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <a href={`/api/files/source/${order.id}?download=1`} className={buttonClasses("primary", "sm")}><Download className="size-3.5" /> Download (60s link)</a>
                    <a href={`/api/files/source/${order.id}`} target="_blank" rel="noopener" className={buttonClasses("secondary", "sm")}><ExternalLink className="size-3.5" /> Open</a>
                  </div>
                )}
              </div>
            )}
          </Card>

          {(claims.length > 0 || order.status === "awaiting_payment") && (
            <PaymentClaims claims={claims} orderPrice={order.price} reference={paymentReference(order.id)} />
          )}

          <StatusControls orderId={order.id} type={order.service_type} status={order.status} />
          {screeningOrder && !closed && <ChecklistControls orderId={order.id} checklist={order.admin_checklist ?? {}} />}

          <Card className="p-5">
            <h2 className="text-[14px] font-semibold">Internal notes</h2>
            <ul className="mt-3 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-xl bg-white/[0.03] p-3 text-[13px]">
                  <p className="whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-1 text-[11px] text-fg-subtle">{formatDateTime(n.created_at)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3"><NoteForm orderId={order.id} /></div>
          </Card>
        </div>

        <div className="space-y-5">
          {screeningOrder && !file && (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold">Submitted text</h2>
              <p className="mt-1 text-[12.5px] text-fg-muted">
                Pasted by the customer{order.word_count ? ` · ${order.word_count.toLocaleString("en-HK")} words` : ""}. Screen it with repository storage off.
              </p>
              <div className="mt-3">
                {order.source_text ? (
                  <SourceText text={order.source_text} fileBase={`order-${shortId(order.id)}`} />
                ) : (
                  <p className="text-[12.5px] text-fg-subtle">
                    {order.source_deleted_at ? `Deleted ${formatDateTime(order.source_deleted_at)} (retention policy).` : "No text on this order."}
                  </p>
                )}
              </div>
            </Card>
          )}
          {screeningOrder ? (
            <ScreeningResultForm orderId={order.id} type={order.service_type} existing={screening} closed={closed} />
          ) : (
            <>
              <Card className="p-5">
                <h2 className="text-[14px] font-semibold">Submitted text</h2>
                <div className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl bg-ink-900/60 p-4 font-serif text-[14px] leading-relaxed text-fg-muted">
                  {order.source_text ?? "Deleted under the retention policy."}
                </div>
              </Card>
              <RefinementResultForm orderId={order.id} revised={refinement?.revised_text ?? order.source_text ?? ""} reviewerNotes={refinement?.reviewer_notes ?? ""} closed={closed} />
            </>
          )}
          {screening && (
            <Card className="p-5 text-[13px]">
              <h2 className="text-[14px] font-semibold">Recorded result</h2>
              <dl className="mt-2 divide-y divide-[var(--line)]">
                <Row k="Provider" v={screening.provider} />
                <Row k="AI indicator" v={screening.ai_indicator === null ? `Not returned${screening.ai_indicator_note ? ` · ${screening.ai_indicator_note}` : ""}` : `${screening.ai_indicator}%`} />
                <Row k="Similarity" v={screening.similarity_percentage === null ? "Not returned" : `${screening.similarity_percentage}%`} />
                <Row k="Screened at" v={formatDateTime(screening.screening_completed_at)} />
                <Row k="Report" v={screening.report_storage_path ? <a className="text-accent underline" target="_blank" rel="noopener" href={`/api/files/report/${order.id}`}>{screening.report_file_name}</a> : "None"} />
              </dl>
            </Card>
          )}
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold">Audit trail</h2>
            <ul className="mt-3 space-y-1.5 font-mono text-[11.5px] text-fg-muted">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3"><span className="shrink-0 text-fg-subtle">{formatDateTime(e.created_at)}</span><span>{e.event}{e.detail && Object.keys(e.detail).length ? ` ${JSON.stringify(e.detail)}` : ""}</span></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
