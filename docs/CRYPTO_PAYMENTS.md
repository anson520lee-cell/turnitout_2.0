# Crypto payments (NOWPayments)

Customers top up credits with USDT, USDC or BTC. Credits are the site's one
entitlement system, so a crypto payment is just another way to pay for a
top-up: it uses `credit_topups` and the existing `credit_confirm_topup()` SQL
function. There is no second ledger.

```
Customer → /billing (Crypto tab) → startCryptoPayment (server action)
  → NOWPayments creates the payment (address + exact coin amount)
  → /billing/crypto/[id]  (QR, network, amount, countdown, live status)
  → customer pays on-chain
  → NOWPayments → POST /api/payments/nowpayments/webhook (HMAC-SHA512 checked)
  → crypto_payments updated, credit_confirm_topup() adds credits once
```

## Environment variables (Vercel, server only)

| Name | Where to get it |
| --- | --- |
| `NOWPAYMENTS_API_KEY` | NOWPayments dashboard > Store settings > API keys |
| `NOWPAYMENTS_IPN_SECRET` | Store settings > Instant payment notifications > IPN secret key |
| `NOWPAYMENTS_API_URL` | optional; live API is the default. Sandbox: `https://api-sandbox.nowpayments.io/v1` (use sandbox keys) |

Both secrets must be Secret type, enabled for Production and Preview. With no
API key the crypto option is hidden. Set the IPN callback URL in NOWPayments to
`https://<your-domain>/api/payments/nowpayments/webhook` (the site also sends
it with every payment).

## Safety rules in the code

- Price is `usd` recomputed on the server; the browser sends only an amount and a coin id.
- Webhooks need a valid signature; payment id, order id, coin, dollar amount,
  address and paid amount are all compared with what the server stored.
- Credits are added only for `confirmed`/`sending`/`finished` with the full amount paid;
  `partially_paid` never adds credits.
- Repeat deliveries are harmless: `credit_confirm_topup()` only works once per top-up,
  and a paid payment can't be moved backwards by a late "waiting".
- The payment page asks our server, which asks NOWPayments (server to server), so a
  late webhook doesn't leave the page stuck. The browser can never mark a payment paid.
- Payments are visible only to their owner (row-level security) and admins.

## Withdrawals

Funds stay in NOWPayments Custody. Withdraw to a wallet from the NOWPayments
dashboard whenever you like; the site doesn't depend on any wallet.

Tests: `npm test`. Migration: `supabase/migrations/0008_nowpayments_crypto.sql`.
