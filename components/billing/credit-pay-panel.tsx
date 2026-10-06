"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coins, Wallet } from "lucide-react";
import { payOrderWithCredits, devMarkPaid, cancelUnpaidOrder } from "@/app/actions/orders";
import { Button, buttonClasses } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { track } from "@/lib/analytics";

/**
 * Pays an unpaid order with credits. If the balance is short, shows how much
 * and links to the Billing & Credits page (pre-filled with a suitable top-up).
 */
export function CreditPayPanel({
  orderId,
  price,
  balance,
  suggestedUsd,
  devPayments,
}: {
  orderId: string;
  /** credits */
  price: number;
  /** credits */
  balance: number;
  suggestedUsd: number;
  devPayments: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"pay" | "dev" | "cancel" | null>(null);
  const enough = balance >= price;
  const n = (v: number) => v.toLocaleString("en-US");

  return (
    <div>
      <dl className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-ink-900/40 text-[13px]">
        <div className="flex items-center justify-between px-3.5 py-2.5">
          <dt className="text-fg-subtle">This order</dt>
          <dd className="font-semibold">{n(price)} credits</dd>
        </div>
        <div className="flex items-center justify-between px-3.5 py-2.5">
          <dt className="text-fg-subtle">Your balance</dt>
          <dd className={enough ? "font-semibold" : "font-semibold text-warn"}>{n(balance)} credits</dd>
        </div>
        <div className="flex items-center justify-between px-3.5 py-2.5">
          <dt className="text-fg-subtle">{enough ? "Balance after" : "You need"}</dt>
          <dd className="font-semibold">{enough ? `${n(balance - price)} credits` : `${n(price - balance)} more credits`}</dd>
        </div>
      </dl>

      {enough ? (
        <Button
          size="lg"
          className="mt-5 w-full"
          loading={pending && which === "pay"}
          disabled={pending}
          onClick={() => {
            setWhich("pay");
            setError(null);
            track("credits_pay_clicked");
            start(async () => {
              const res = await payOrderWithCredits(orderId);
              if (!res.ok) setError(res.message);
              router.refresh();
            });
          }}
        >
          <Coins className="size-4" /> Pay {n(price)} credits
        </Button>
      ) : (
        <Link href={`/billing?need=${suggestedUsd}`} className={buttonClasses("primary", "lg", "mt-5 w-full")}>
          <Wallet className="size-4" /> Top up credits
        </Link>
      )}
      <p className="mt-2 text-center text-[11.5px] text-fg-subtle">
        Your order joins the queue the moment it&rsquo;s paid. Credits are charged once, and returned if anything goes wrong.
      </p>

      <div className="mt-4">
        <FormMessage>{error}</FormMessage>
      </div>

      <div className="mt-2 space-y-2">
        {devPayments && (
          <Button
            variant="outline"
            size="sm"
            className="w-full border-warn/40 text-warn"
            loading={pending && which === "dev"}
            disabled={pending}
            onClick={() => {
              setWhich("dev");
              start(async () => {
                const res = await devMarkPaid(orderId);
                if (!res.ok) setError(res.message);
                router.refresh();
              });
            }}
          >
            Simulate payment (development only)
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          disabled={pending}
          loading={pending && which === "cancel"}
          onClick={() => {
            if (!confirm("Cancel this unpaid order? Your text will be deleted.")) return;
            setWhich("cancel");
            start(async () => {
              const res = await cancelUnpaidOrder(orderId);
              if (!res.ok) setError(res.message);
              router.refresh();
            });
          }}
        >
          Cancel order
        </Button>
      </div>
    </div>
  );
}
