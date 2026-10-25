import { Bitcoin, CircleDollarSign, Coins, CreditCard, Landmark, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import { enabledManualPayments, isCryptoMethod, type ManualPaymentMethod } from "@/config/payments";
import { cn } from "@/lib/utils";

/** Generic icons only: no payment-brand logos. */
export const methodIcons: Record<ManualPaymentMethod | "card", LucideIcon> = {
  alipay: Wallet,
  payme: Smartphone,
  paypal: Wallet,
  bank_transfer: Landmark,
  usdt: CircleDollarSign,
  usdc: Coins,
  bitcoin: Bitcoin,
  card: CreditCard,
};

/** "Pay with  [USDT] [USDC] [BTC] [PayPal] [Alipay]" chips: the crypto coins plus every hand-confirmed method that is switched on. */
export function PaymentMethodStrip({ className }: { className?: string; card?: boolean }) {
  const coins = [
    { label: "USDT", Icon: methodIcons.usdt },
    { label: "USDC", Icon: methodIcons.usdc },
    { label: "BTC", Icon: methodIcons.bitcoin },
    ...enabledManualPayments()
      .filter((m) => !isCryptoMethod(m.id))
      .map((m) => ({ label: m.label, Icon: methodIcons[m.id] })),
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle", className)}>
      <span className="mr-1">Pay with</span>
      {coins.map(({ label, Icon }) => (
        <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.03] px-2.5 py-1 text-fg-muted">
          <Icon className="size-3.5" aria-hidden /> {label}
        </span>
      ))}
    </div>
  );
}
