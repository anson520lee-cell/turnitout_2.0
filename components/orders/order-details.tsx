import type { Order, OrderFile, PaymentRow } from "@/types/domain";
import { Card } from "@/components/ui/card";
import { serviceLabels } from "@/config/services";
import { billableChars, formatHKD } from "@/config/pricing";
import { paymentMethodLabel, paymentReference } from "@/config/payments";
import { isScreening } from "@/lib/orders/status";
import { formatBytes, formatDateTime } from "@/lib/utils";

/** The facts of an order for its owner: what was ordered, what it costs, how it was paid. */
export function OrderDetails({ order, file, payments }: { order: Order; file: OrderFile | null; payments: PaymentRow[] }) {
  const screeningOrder = isScreening(order.service_type);
  const paid = payments.filter((p) => p.status === "succeeded");
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold">Order details</h2>
      <dl className="mt-4 grid gap-x-6 gap-y-4 text-[13.5px] sm:grid-cols-2">
        <div><dt className="text-fg-subtle">Service</dt><dd className="mt-0.5">{serviceLabels[order.service_type]}</dd></div>
        <div><dt className="text-fg-subtle">Price</dt><dd className="mt-0.5">{formatHKD(order.price)}</dd></div>
        <div><dt className="text-fg-subtle">Word count</dt><dd className="mt-0.5">{order.word_count?.toLocaleString("en-HK") ?? "Counted during processing"}</dd></div>
        {!screeningOrder && order.source_text && (
          <div><dt className="text-fg-subtle">Characters</dt><dd className="mt-0.5">{billableChars(order.source_text).toLocaleString("en-HK")}</dd></div>
        )}
        {file && <div><dt className="text-fg-subtle">File</dt><dd className="mt-0.5 truncate">{file.file_name} · {formatBytes(file.file_size)}</dd></div>}
        <div><dt className="text-fg-subtle">Payment reference</dt><dd className="mt-0.5 font-mono">{paymentReference(order.id)}</dd></div>
        {order.paid_at && <div><dt className="text-fg-subtle">Paid</dt><dd className="mt-0.5">{formatDateTime(order.paid_at)}</dd></div>}
        {order.instructions && (
          <div className="sm:col-span-2">
            <dt className="text-fg-subtle">{screeningOrder ? "Notes" : "Instructions"}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-fg-muted">{order.instructions}</dd>
          </div>
        )}
      </dl>

      {paid.length > 0 && (
        <ul className="mt-5 space-y-2 border-t border-[var(--line)] pt-4 text-[13px]">
          {paid.map((p) => (
            <li key={p.id} className="flex justify-between gap-3">
              <span className="text-fg-muted">{paymentMethodLabel(p.provider)} · {formatDateTime(p.created_at)}</span>
              <span>{formatHKD(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {order.status === "cancelled" && !paid.length && <p className="mt-5 border-t border-[var(--line)] pt-4 text-[13px] text-fg-muted">No payment taken.</p>}

      {order.source_text ? (
        <details className="group mt-5 rounded-xl border border-[var(--line)] bg-ink-900/40">
          <summary className="cursor-pointer list-none px-3.5 py-3 text-[13px] text-fg-muted transition hover:text-fg [&::-webkit-details-marker]:hidden">
            <span className="mr-1.5 inline-block transition group-open:rotate-90">›</span> Your submitted text
          </summary>
          <div className="max-h-[320px] overflow-auto whitespace-pre-wrap border-t border-[var(--line)] px-3.5 py-3 font-serif text-[14px] leading-[1.75] text-fg-muted">
            {order.source_text}
          </div>
        </details>
      ) : order.source_deleted_at ? (
        <p className="mt-5 text-[12.5px] text-fg-subtle">Your submitted text was deleted {formatDateTime(order.source_deleted_at)} under our retention policy.</p>
      ) : null}

      {screeningOrder && order.status !== "cancelled" && (
        <p className="mt-5 rounded-xl border border-[var(--line)] bg-ink-900/40 p-3.5 text-[12.5px] leading-relaxed text-fg-muted">
          What you&rsquo;ll receive: the result a Turnitin screening returns for this text, entered exactly as returned, plus the report file where available. It is not a prediction.
        </p>
      )}
    </Card>
  );
}
