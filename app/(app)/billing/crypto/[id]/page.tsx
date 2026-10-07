import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { CryptoPaymentView, type CryptoPaymentData } from "@/components/billing/crypto-payment-view";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { paymentUri, qrDataUrl } from "@/lib/payments/nowpayments/qr";

export const metadata: Metadata = { title: "Crypto payment" };

export default async function CryptoPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/billing/crypto/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Row-level security plus the explicit user filter: other people's payments are "not found".
  const supabase = await createClient();
  const { data } = await supabase
    .from("crypto_payments")
    .select("id,usd,pay_currency,network,pay_amount,actually_paid,pay_address,status,expires_at,created_at,paid_at,np_payment_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) notFound();
  const payment = data as CryptoPaymentData;
  const qr = payment.pay_address ? await qrDataUrl(paymentUri(payment.pay_currency, payment.pay_address, payment.pay_amount)) : null;

  return (
    <>
      <AppHeader title="Pay with crypto" body="Send the exact amount below. Your credits are added automatically once the payment is confirmed." />
      <CryptoPaymentView initial={payment} qr={qr} />
    </>
  );
}
