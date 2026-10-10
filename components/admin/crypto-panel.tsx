"use client";
import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { runCryptoCheck } from "@/app/actions/admin-crypto";
import type { CryptoCheck } from "@/lib/payments/nowpayments";

/** Account check for NOWPayments on /admin/crypto. */
export function CryptoPanel() {
  const [check, setCheck] = useState<CryptoCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState(false);
  const [pending, start] = useTransition();

  const run = (test: boolean) =>
    start(async () => {
      setError(null);
      const res = await runCryptoCheck(test);
      if (!res.ok) return setError(res.message);
      setCheck(res.check);
      setTested(test);
    });

  // A quick look at the account when the page opens (no payments are created).
  useEffect(() => {
    start(async () => {
      const res = await runCryptoCheck(false);
      if (res.ok) setCheck(res.check);
      else setError(res.message);
    });
  }, []);

  const yes = (key: string) => <Badge key={key} tone="success">Yes</Badge>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold">NOWPayments account</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(false)}>
            Refresh
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(true)}>
            {pending ? "Checking…" : "Test every coin (asks for a deposit address)"}
          </Button>
        </div>
      </div>
      {error && <FormMessage>{error}</FormMessage>}
      {!check && !error && <p className="text-[13px] text-fg-muted">Checking…</p>}
      {check && (
        <>
          <dl className="divide-y divide-[var(--line)] text-[13px]">
            <div className="grid grid-cols-[210px_1fr] gap-3 py-2.5">
              <dt className="text-fg-subtle">API key in Vercel</dt>
              <dd>{check.keysSet.apiKey ? yes("a") : <Badge tone="danger">Missing</Badge>}</dd>
            </div>
            <div className="grid grid-cols-[210px_1fr] gap-3 py-2.5">
              <dt className="text-fg-subtle">IPN secret in Vercel</dt>
              <dd>{check.keysSet.ipnSecret ? yes("i") : <Badge tone="danger">Missing</Badge>}</dd>
            </div>
            <div className="grid grid-cols-[210px_1fr] gap-3 py-2.5">
              <dt className="text-fg-subtle">NOWPayments accepts the key</dt>
              <dd>{check.api.ok ? yes("s") : <span className="text-risk">{check.api.message || "No"}</span>}</dd>
            </div>
            <div className="grid grid-cols-[210px_1fr] gap-3 py-2.5">
              <dt className="text-fg-subtle">Coins switched on in the account</dt>
              <dd className="min-w-0">
                {check.enabledIds ? (
                  check.enabledIds.length ? (
                    <span>
                      {check.enabledIds.length} coins ({check.coins.filter((c) => c.enabled).length} of the {check.coins.length} the site offers)
                    </span>
                  ) : (
                    <Badge tone="warn">None</Badge>
                  )
                ) : (
                  <span className="text-warn">{check.enabledError ?? "Couldn't read the list"}</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-[12.5px]">
              <thead className="text-fg-subtle">
                <tr className="border-b border-[var(--line)]">
                  <th className="py-2 pr-3 font-medium">Coin the site offers</th>
                  <th className="py-2 pr-3 font-medium">Network</th>
                  <th className="py-2 pr-3 font-medium">Switched on</th>
                  <th className="py-2 pr-3 font-medium">Smallest payment</th>
                  <th className="py-2 font-medium">Deposit address test</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] text-fg-muted">
                {check.coins.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 text-fg">
                      {c.asset} <span className="font-mono text-[11px] text-fg-subtle">{c.id}</span>
                    </td>
                    <td className="py-2 pr-3">{c.network}</td>
                    <td className="py-2 pr-3">{c.enabled === null ? "–" : c.enabled ? yes(`e${c.id}`) : <Badge tone="warn">No</Badge>}</td>
                    <td className="py-2 pr-3">
                      {c.minUsd === null ? (
                        "–"
                      ) : c.minUsd > check.siteMinUsd ? (
                        <span className="text-warn">US${c.minUsd} (above the site&rsquo;s US${check.siteMinUsd} minimum)</span>
                      ) : (
                        <span>US${c.minUsd}</span>
                      )}
                    </td>
                    <td className="py-2">
                      {c.test ? (
                        <span className={c.test.ok ? "text-ok" : "text-risk"}>{c.test.message}</span>
                      ) : (
                        <span className="text-fg-subtle">{tested ? "–" : "not tested"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] leading-relaxed text-fg-subtle">
            The test asks NOWPayments for a US$10 payment on each coin that nobody pays; it just expires. If a coin says it isn&rsquo;t enabled or has no payout wallet, fix it in the NOWPayments dashboard
            (Store settings), then test again. Coins NOWPayments reports as switched off are hidden from customers; if the list can&rsquo;t be read, the site shows all six.
          </p>
        </>
      )}
    </div>
  );
}
