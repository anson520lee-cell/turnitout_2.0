import type { CSSProperties } from "react";
import { NavigationLink as Link } from "@/components/ui/navigation-link";
import { ArrowRight } from "lucide-react";
import type { Order } from "@/types/domain";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { serviceLabels } from "@/config/services";
import { formatCredits } from "@/config/pricing";
import { formatDate, shortId } from "@/lib/utils";

/**
 * One order on a hairline row: its number in the list, title and details,
 * price and status. Hovering answers in beats (the rule lights, the row
 * shifts, the arrow moves); pressing sinks it.
 */
export function OrderRow({ order, href, paymentPending, index }: { order: Order; href?: string; paymentPending?: boolean; index?: number }) {
  return (
    <li className="app-row" style={index !== undefined ? ({ "--i": index } as CSSProperties) : undefined}>
      <Link href={href ?? `/orders/${order.id}`} data-press className="app-row-link group">
        {index !== undefined && <span className="nav-idx app-row-idx">{String(index + 1).padStart(2, "0")}</span>}
        <div className="app-row-main min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-medium text-fg">{order.title}</p>
          <p className="mt-0.5 truncate text-[12px] text-fg-subtle">
            {serviceLabels[order.service_type]} · #{shortId(order.id)} · {formatDate(order.created_at)}
          </p>
        </div>
        <span className="hidden font-mono text-[12.5px] text-fg-muted sm:block">{formatCredits(order.price)}</span>
        {paymentPending && order.status === "awaiting_payment" ? (
          <Badge tone="warn" dot>
            Confirming payment
          </Badge>
        ) : (
          <StatusBadge status={order.status} />
        )}
        <ArrowRight className="app-row-arrow size-4" aria-hidden />
      </Link>
    </li>
  );
}
