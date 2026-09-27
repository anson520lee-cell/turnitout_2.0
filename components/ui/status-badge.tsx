import { statusMeta, type OrderStatus } from "@/lib/orders/status";
import { Badge, type Tone } from "./badge";

const toneMap: Record<string, Tone> = {
  neutral: "neutral",
  info: "info",
  progress: "progress",
  success: "success",
  danger: "danger",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const m = statusMeta[status];
  return (
    <Badge tone={toneMap[m.tone]} dot>
      {m.label}
    </Badge>
  );
}
