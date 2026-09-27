"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Lock } from "lucide-react";
import { startCheckout, devMarkPaid, cancelUnpaidOrder } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { track } from "@/lib/analytics";

export function PaymentPanel({ orderId, price, devPayments }: { orderId: string; price: string; devPayments: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"pay" | "dev" | "cancel" | null>(null);

  return (
    <div className="space-y-3">
      <Button
        size="lg"
        className="w-full"
        loading={pending && which === "pay"}
        disabled={pending}
        onClick={() => {
          setWhich("pay");
          setError(null);
          track("checkout_started");
          start(async () => {
            const res = await startCheckout(orderId);
            if (res && !res.ok) setError(res.message);
          });
        }}
      >
        <CreditCard className="size-4" /> Pay {price}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-[11.5px] text-fg-subtle">
        <Lock className="size-3" /> Secure checkout by Stripe
      </p>
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
      <FormMessage>{error}</FormMessage>
      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        disabled={pending}
        onClick={() => {
          if (!confirm("Cancel this unpaid order? Any uploaded file will be deleted.")) return;
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
  );
}
