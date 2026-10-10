"use server";

import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { checkCrypto, type CryptoCheck } from "@/lib/payments/nowpayments";
import { appUrl } from "@/lib/utils";

/** Asks NOWPayments about the account; with test=true also asks for one deposit address per coin. */
export async function runCryptoCheck(test: boolean): Promise<{ ok: true; check: CryptoCheck } | { ok: false; message: string }> {
  const admin = await assertAdmin();
  try {
    const check = await checkCrypto({ test: test === true, callbackUrl: `${appUrl()}/api/payments/nowpayments/webhook` });
    if (test) await audit("crypto_check_run", { actorId: admin.id });
    return { ok: true, check };
  } catch {
    return { ok: false, message: "The check couldn't run. Try again." };
  }
}
