import Link from "next/link";
import { ChevronRight, FileCheck2, PenLine } from "lucide-react";
import type { Order } from "@/types/domain";
import { StatusBadge } from "@/components/ui/status-badge";
import { serviceLabels } from "@/config/services";
import { formatHKD } from "@/config/pricing";
import { formatDate, shortId } from "@/lib/utils";
import { isScreening } from "@/lib/orders/status";

export function OrderRow({ order, href }: { order: Order; href?: string }) {
  const Icon = isScreening(order.service_type) ? FileCheck2 : PenLine;
  return (
    <li>
      <Link
        href={href ?? `/orders/${order.id}`}
        className="group flex items-center gap-4 px-4 py-3.5 transition hover:bg-white/[0.03] sm:px-5"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-white/[0.03]">
          <Icon className="size-4 text-accent" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{order.title}</p>
          <p className="mt-0.5 text-[12px] text-fg-subtle">
            {serviceLabels[order.service_type]} · #{shortId(order.id)} · {formatDate(order.created_at)}
          </p>
        </div>
        <span className="hidden text-[13px] text-fg-muted sm:block">{formatHKD(order.price)}</span>
        <StatusBadge status={order.status} />
        <ChevronRight className="size-4 text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
      </Link>
    </li>
  );
}
