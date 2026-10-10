import type { Metadata } from "next";
import { assertAdmin } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";
import { CryptoPanel } from "@/components/admin/crypto-panel";

export const metadata: Metadata = { title: "Admin · Crypto" };
export const maxDuration = 60;

export default async function AdminCrypto() {
  await assertAdmin();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Crypto payments</h1>
      <p className="mt-1 max-w-3xl text-[13px] text-fg-muted">
        Checks the NOWPayments account behind the site: is the key accepted, which coins are switched on, and whether each coin can really produce a deposit address.
      </p>
      <Card className="mt-6 p-5">
        <CryptoPanel />
      </Card>
    </>
  );
}
