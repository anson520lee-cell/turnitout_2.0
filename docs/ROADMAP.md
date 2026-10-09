# 0% roadmap (agreed 2026-10-09)

Items accepted from the improvement list: 1, 2, 3, 5, 6, 7, 8, 15, 16, 17.
"Owner" = Jordan has to do it (accounts, money, secrets, legal); "Claude" = code that can be done alone.

## Week 1: make payments real (blocking)

| # | Task | Who | Effort | Notes |
|---|------|-----|--------|-------|
| 1a | Supabase Auth → URL Configuration: Site URL + Redirect URLs | Owner | 5 min | Fixes reset-password / signup / Google links landing on localhost. |
| 1b | Rotate the Resend API key, put the new one in Vercel as `RESEND_API_KEY` (Sensitive), redeploy | Owner | 5 min | `NOTIFY_EMAIL_TO=anson520lee@gmail.com` is already set. |
| 1c | Test every payment method with a small amount (USDT, USDC, BTC, PayPal, card) | Owner | 30 min | Check the admin "Payments to verify" list and that credits arrive. |
| 17 | Analytics (Vercel Web Analytics) | Claude + Owner | 10 min | Code: done by Claude. Owner: Vercel → project → Analytics → Enable. |
| 3 | Refund policy + clearer terms | Claude drafts, Owner approves | 1 h | Draft is on /refunds and /terms; read it, change anything you disagree with. Not legal advice. |
| 5 | USDT (TRON) / USDC (Base) auto-confirmation | Claude | 0.5 day | Each account pays an exact amount with its own cents; the server checks the chain and credits automatically. BTC stays manual. |

## Week 2: trust and conversion

| # | Task | Who | Effort | Notes |
|---|------|-----|--------|-------|
| 2 | Own domain (e.g. zeropercent.app) | Owner buys, Claude wires | 1 h | After buying: add it in Vercel, set `NEXT_PUBLIC_APP_URL`, add it to Supabase Redirect URLs, verify it in Resend (DNS records). |
| 6 | Customer emails (payment confirmed, report ready) | Claude | 0.5 day | Code is ready; Resend only delivers to other people once the domain (#2) is verified in Resend. |
| 7 | Sample report page | Claude | 0.5 day | Our own report format with clearly labelled example data; no Turnitin branding. |
| 8 | Promo codes + referral credits | Claude | 1 day | Needs a database migration; Owner decides the amounts. |

## Week 3: one visual language

| # | Task | Who | Effort | Notes |
|---|------|-----|--------|-------|
| 15 | Readability: no essential text below 11px, raise contrast of small text | Claude | 0.5 day | Terminal/mono labels stay decorative; anything a user must read gets real size. |
| 16 | Style unification across marketing, scan, auth and app pages | Claude | 1–2 days | Shared page header, card, section spacing and type scale; effects rules: particles only on public headings, terminal + document as the one product visual, the app stays quiet. |

## Order of work (Claude, now)
1. Analytics (17) → 2. Policies draft (3) → 3. Crypto auto-confirm (5) → 4. Customer emails (6) → 5. Sample report (7) → 6. Readability + style pass (15/16) → 7. Promo/referral (8, after you choose amounts).
