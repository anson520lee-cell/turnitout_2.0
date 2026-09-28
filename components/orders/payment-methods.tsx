import { CreditCard, Landmark, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import { enabledManualPayments, type ManualPaymentMethod } from "@/config/payments";
import { cn } from "@/lib/utils";

/** Generic icons only: no payment-brand logos. */
export const methodIcons: Record<ManualPaymentMethod | "card", LucideIcon> = {
  alipay: Wallet,
  payme: Smartphone,
  bank_transfer: Landmark,
  card: CreditCard,
};

/** "Pay with  [Alipay] [PayMe] [Bank transfer]" chips, from config/payments.ts. */
export function PaymentMethodStrip({ className, card = false }: { className?: string; card?: boolean }) {
  const methods = enabledManualPayments();
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle", className)}>
      <span className="mr-1">Pay with</span>
      {methods.map((m) => {
        const Icon = methodIcons[m.id];
        return (
          <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.03] px-2.5 py-1 text-fg-muted">
            <Icon className="size-3.5" aria-hidden /> {m.label}
          </span>
        );
      })}
      {card && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.03] px-2.5 py-1 text-fg-muted">
          <CreditCard className="size-3.5" aria-hidden /> Card
        </span>
      )}
    </div>
  );
}
