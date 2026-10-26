# 0%

A pre-submission service for students checking their own academic writing. It offers two separate services (the free scan that used to be a third was removed on 2026-10-25; every account now gets one free full report a day instead, see `freeReport` in `config/app.ts`):

| Service | What it is | Where the result comes from |
| --- | --- | --- |
| **AI-Writing Risk Report** (automatic, 1 credit per 1,000 characters, minimum 2 credits, first 8,000 of every 20,000 characters charged and the rest free, 500–100,000 characters) | Our own reviewer (DeepSeek) reads the whole pasted text in pieces and the answers are stitched into one report | Overall level, paragraph map, marked sentences, grammar spots and a PDF. Not a Turnitin result and no Turnitin-like percentage |
| **Writing Refinement** (1 credit per 1,000 characters, minimum 3 credits) | Human clarity/flow/style refinement of the author's own text | A reviewer |

The UI keeps these apart everywhere: the report is labelled as our own reviewer's guidance. Older hand-made Turnitin reports still display as the observed result of that run.

> Turnitin is a third-party service. This platform is independently operated and is not affiliated with, endorsed by, or operated by Turnitin. The app contains no Turnitin branding, UI, credentials, scraping or automation.

The brand name is "0%". Rename it in `config/app.ts` (`brand`); nothing else hard-codes it.

---

## Before launch: two things to confirm

1. **Licence (only for the older hand-made reports; the automatic report does not use Turnitin).** Turnitin educator/institutional licences usually limit use to the licensee's own courses and students. Screening documents for paying outside customers through that account may breach the licence and the institution's agreement, regardless of disclaimers on this site. Get written permission from Turnitin or the institution first. The provider sits behind the `ScreeningProvider` interface, so a properly licensed source can be swapped in without touching the frontend.
2. **Repository storage.** If a paper is submitted to an assignment that stores papers in the standard repository, the customer's real submission later matches itself at close to 100%. The admin workflow blocks moving an order to **Screening** until the "no repository" checkbox is confirmed, and the FAQ explains this to customers.

---

## Architecture

```
USER ─► NEXT.JS (App Router)
          └─ Paid orders ─ Stripe Checkout ─► webhook ─► queue
                              └─ Admin workflow (human) ─► TURNITIN (outside the app)
                                                    └─► screening_results + private report ─► user dashboard
Supabase: Auth · Postgres (RLS) · private Storage
```

- **Next.js 16** (App Router, Turbopack, `proxy.ts` instead of middleware), TypeScript strict, Tailwind v4, Framer Motion, react-three-fiber (hero only, lazy-loaded, desktop only, respects reduced motion).
- **Supabase** for auth, Postgres and storage. The browser only ever reads its own rows through RLS. All writes to orders, files, results and payments happen in server actions with the service role, after the server checks identity, role and recomputes prices.
- **Stripe Checkout**, confirmed only by a signature-verified webhook that also checks the amount against the stored order price.

### Key modules

| Path | Purpose |
| --- | --- |
| `config/pricing.ts` | All prices (HKD cents). Nothing else hard-codes a price. |
| `config/app.ts` | Brand, daily limit, upload limits, retention periods. |
| `config/services.ts`, `config/faq.ts` | Service copy, disclaimers, FAQ. |
| `lib/orders/status.ts` | The order state machine: labels, flows, allowed transitions. |
| `lib/network.ts` | Salted hash of the visitor's network address, for the daily free report's per-address cap. |
| `lib/screening/` | `ScreeningProvider` interface and `ManualTurnitinProvider` (human-in-the-loop). |
| `lib/payments/` | Stripe client and `markOrderPaid` (idempotent, amount-checked), used by the webhook and by admin claim confirmation. |
| `config/payments.ts` | Alipay / PayMe / bank transfer payee details, QR paths and instructions. |
| `app/actions/` | Server actions: orders, admin, account. |
| `app/api/files/[kind]/[orderId]` | Access-checked 60-second signed URLs for source files and reports. |
| `app/api/stripe/webhook` | Marks card orders paid (signature- and amount-checked). Manual payments are confirmed by an admin; see [Payments](#payments). |
| `app/api/cron/retention` | Scheduled deletion of old documents and reports. |
| `supabase/migrations/0001_init.sql` | Tables, constraints, indexes, RLS, storage buckets and policies. |
| `lib/local-model/`, `app/api/model-worker/`, `tools/local-model-worker/` | Optional local writing model: job queue, worker API and the worker program. See [Local writing model](#local-writing-model). |

### Order statuses

Report (automatic): `awaiting_payment → paid → screening → completed` (or `cancelled` with credits returned if it fails). The order page calls `/api/reports/[id]/advance` while open; `lib/auto-report/` cuts, reviews and stitches. Older hand-made reports used `queued → screening → report_ready → completed`.
Refinement: `awaiting_payment → paid → queued → under_review → processing → completed` (or `cancelled`)

`paid` is set only by the verified Stripe webhook or by an admin confirming a manual payment claim. Customers see results only when an order is `completed` (enforced by RLS, not just the UI).

---

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

Without Supabase variables the marketing site runs and the app pages show a "not configured" notice.

### Environment variables

See `.env.example`. `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `CRON_SECRET` are server-only and must never be prefixed with `NEXT_PUBLIC_` or committed. There is intentionally no Turnitin variable.

### Supabase

1. Create a project. Copy the URL, anon key and service role key into `.env.local`.
2. Apply the schema: `supabase db push` (with the Supabase CLI linked), or paste the whole of `supabase/setup.sql` (all four migrations in order) into the SQL editor and run it once. Step-by-step: `docs/SUPABASE_SETUP.md`. This creates the private `documents` and `reports` buckets with size and MIME limits.
3. **Auth → URL configuration**: set Site URL to your app URL and add `<app-url>/auth/callback` to redirect URLs.
4. Optional Google sign-in: enable the Google provider, then set `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true`.
5. Make yourself an admin (SQL editor):
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
   Roles can't be changed from the app or by users (a trigger blocks it).

### Stripe

1. Put the secret and publishable keys in `.env.local`.
2. Add a webhook endpoint `<app-url>/api/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`, and copy its signing secret to `STRIPE_WEBHOOK_SECRET`.
3. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
4. Without Stripe, set `ALLOW_DEV_PAYMENTS=true` in development to get a "Simulate payment" button. It is ignored in production builds.

Stripe is optional. When it isn't configured the card option is simply hidden and customers pay by Alipay, PayMe or bank transfer (see [Payments](#payments)).

### Commands

```bash
npm run dev      # development
npm run lint     # eslint
npx tsc --noEmit # typecheck (run `npx next typegen` first on a fresh clone)
npm run build    # production build
```

### Deployment (Vercel)

Set all env vars in the project, deploy, point the Stripe webhook at the production URL, and set `CRON_SECRET`. `vercel.json` schedules `/api/cron/retention` daily (Vercel sends `Authorization: Bearer $CRON_SECRET`).

---

## Pricing

All prices live in `config/pricing.ts` (HKD cents) and are recomputed on the server; the browser never sends an amount.

| Product | Price | Limits |
| --- | --- | --- |
| AI-Writing Risk Report (`combined_screening`) | 1 credit per 1,000 characters, minimum 2 credits; first 8,000 of every 20,000 characters charged, the rest free (`reportPricing`) | 500–100,000 characters, checked in the browser and again in `screeningTextOrderInput` |
| Writing Refinement (`refinement`) | 1 credit per 1,000 characters, rounded up, minimum 3 credits = 3,000 characters (`refinementPricing`, `refinementPrice(billableChars(text))`) | 200–60,000 characters per order (`config/app.ts` → `refinement`) |
| Daily free report | Free, 1 a day per account, up to 4,000 characters (`freeReport`) | — |

Characters are counted by `billableChars()`: spaces count, runs of whitespace count once. `ai_screening` and `similarity_screening` remain in the enum so older orders still display, but they are no longer offered.

Customers request both paid services the same way: press **Get report** (or **Paste your text**), paste into the dialog, press Enter. The server re-validates, creates an unpaid order holding the text (`createScreeningTextOrder` / `createRefinementOrder`), and the browser goes to the order's payment page. At most 10 unpaid orders per account.

## Payments

The order page offers **Alipay**, **PayMe** and **bank transfer (FPS)**, plus **card** through Stripe Checkout only when `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set.

Manual methods are confirmed by a person:

1. The customer sees the exact amount, your payee details, the steps and a reference code (`ZP-` + the first 8 characters of the order id) to put in the payment note.
2. After paying they enter their transaction number or payer name. `submitPaymentClaim` stores a `payment_claims` row (amount = the order's server-side price; one pending claim per order). The order stays `awaiting_payment`; the page shows "Payment submitted — we're confirming it" and refreshes itself every 20 seconds.
3. You get a notification. In **Admin → Overview → Payments to verify** (or the order page), check your Alipay / PayMe / bank account for the reference and amount, then:
   - **Confirm payment received**: records the payment through the same `markOrderPaid` path as Stripe (provider = the method, id = the claim id) and queues the order.
   - **Reject** (optional note, shown to the customer): the order stays unpaid and the customer can submit again.

**Alipay orders start first and are checked later** (`lib/payments/pay-first.ts`): when a customer pays one order by Alipay, `submitPaymentClaim` marks the order paid straight away and the report starts; the claim stays `pending` and appears in **Admin → Overview → Alipay payments to check later**, with **Received**, **Not received** and **All received**. Limits: a transaction number that doesn't look like an AlipayHK receipt's (a long number starting with a recent date, `lib/payments/alipay-number.ts`) waits for Confirm; an account with an unchecked started payment gets the old flow above for its next Alipay order (it waits for Confirm, and starts by itself once the earlier payment is marked Received), and **Not received** marks the account (audit event `payment_claim_fake`) so it can't pay orders by Alipay again; the report is not taken back and its payment row is removed. If such a report fails before the check, only the credits used first are refunded; the Alipay part is refunded as credits when the payment is marked Received. Alipay credit top-ups are still confirmed before any credits are added. Reports are moved forward by the customer's open order page; one nobody is watching (page closed, or confirmed hours later) is finished by the every-minute background runner (`app/api/cron/chunk-queue`, `lib/auto-report/sweep.ts`).

Customers can never mark an order paid except through that Alipay pay-first path, which is limited as above; otherwise only a verified Stripe webhook or an admin confirming a claim can. Refunds happen outside the app.

**Set your payee details before launch** in `config/payments.ts`: replace every value starting with `REPLACE`, set `enabled` per method, and put QR images at `public/payments/alipay-qr.png` and `public/payments/payme-qr.png` (or set `qrImage: null`). Missing images show a neutral frame. **Admin → Settings** lists any method still using placeholders.

## Owner notifications

`lib/notify.ts` sends you a message by Telegram and/or email (Resend), after the response so it never slows the customer down:

| Event | When |
| --- | --- |
| `order_created` | A report or refinement order is created |
| `payment_submitted` | A customer reports an Alipay / PayMe / bank payment (check your account) |
| `payment_confirmed` | You confirm a claim, or Stripe confirms a card payment |
| `payment_rejected` | You reject a claim |

Messages contain the order number, service, word or character count, amount, payment method and account email, never document text, titles or file names. Order and payment messages are retried once if a send fails. If a card payment arrives for an order that was already cancelled, you get a `payment_confirmed` message telling you to refund it or restore the order.

| Channel | Environment variables |
| --- | --- |
| Telegram | `TELEGRAM_BOT_TOKEN` (from @BotFather), `TELEGRAM_CHAT_ID` |
| Email | `RESEND_API_KEY`, `NOTIFY_EMAIL_TO` (comma-separated), optional `NOTIFY_EMAIL_FROM` |

**Admin → Settings** shows which channels are configured.

## Admin workflow

0. Orders with a reported manual payment appear first under **Payments to verify**. Confirm or reject them (see [Payments](#payments)).
1. Paid orders land in **Admin → Overview → Work queue** (oldest first).
2. Open the order. Copy the pasted text or download it as .txt (older orders: download the source file through a 60-second signed link, logged).
3. **Checklist:** confirm the Turnitin assignment is set to *no repository*. Required before moving to **Screening**.
4. Move to **Screening** and perform the screening in Turnitin, outside this app.
5. Enter what was returned: AI-writing indicator and/or similarity %, leaving blank anything not returned (with a note if the AI indicator was withheld). Upload the report PDF/DOCX.
6. Move to **Report ready** (the app checks the requested values or a reason are present), review, then **Complete & release**. The customer can now see the result.
7. Tick "removed from the external workspace" once done.

Every step writes to `audit_events`.

## Local writing model

The owner's own model, served by Open WebUI on the owner's computer, can write first drafts of refinement orders. Everything is off until `MODEL_WORKER_SECRET` (24+ characters) is set.

- **Pull, not push.** `tools/local-model-worker/worker.mjs` (Node 18+, no packages) polls `POST /api/model-worker/next` and reports to `POST /api/model-worker/jobs/[id]`, authenticated with `Authorization: Bearer $MODEL_WORKER_SECRET` (constant-time check). The owner's computer only makes outgoing requests. Each poll is a heartbeat (`model_worker.last_seen_at`).
- **Queue:** migration `0003`. `claim_model_job` hands out one job at a time (`for update skip locked`), scan feedback first, and requeues a draft whose worker stopped reporting progress for 20 minutes (up to three tries). Service role only.
- **Refinement drafts** are queued when an order is paid (`markOrderPaid`) or from the admin order page. The worker reads the text from the order at claim time (it is never copied into the job), writes it in chunks of `CHUNK_CHARS`, and between chunks answers waiting scan feedback. The admin loads the draft into the revision editor and reviews it; the customer sees only what the admin saves and releases. Drafts are deleted with the order's text by the retention cron.
- **Prompts** live in `lib/local-model/prompts.ts`, not in the worker, so the rules ship with the site: clarity, grammar and flow only; keep meaning, citations and voice; nothing about AI detection or evading it.
- The privacy page says the model runs on equipment the operator controls and text doesn't go to an outside AI provider. That's only true if `OPENWEBUI_MODEL` is a local model; change the page before using a cloud model.

Setup (in Traditional Chinese for the owner): `tools/local-model-worker/README.md`.

## Network cap for the daily free report

Besides the one-a-day allowance per account, free reports are counted per network address (`freeReport.perNetworkLimit`, `lib/network.ts`, `lib/free-report.ts`, migration `0015`), so throw-away accounts cannot hand out unlimited reports:

- The address comes from the first `x-forwarded-for` entry, else `x-real-ip`, and only on a host that overwrites them: Vercel (detected from `VERCEL`), or another host where you set `TRUST_PROXY_IP_HEADERS=true` because its proxy replaces any value the visitor sends. Elsewhere these headers can be forged, so they are ignored.
- IPv6 counts per /64, because one device can rotate through addresses inside its /64.
- Without a trusted header, all visitors share one `unknown` bucket, so the limit fails closed.
- Only a salted SHA-256 of the address is stored (`GUEST_IP_SALT`, or a value derived from the service-role key when unset). Neither the address nor the hash is logged.
- People behind one shared address (a school network, mobile carrier NAT) share the cap.

The old free scan (removed) left some tables behind: `scan_results`, `scan_usage`, `guest_scan_usage` and the SQL functions `consume_scan` / `consume_guest_scan`. They are unused; Settings → "Delete scan history" still lets a user erase their own old scan records.

## Interaction design

`components/motion/interactive-surfaces.tsx` mounts one pointer engine (`components/motion/pointer-engine.ts`) for the whole site: a single `requestAnimationFrame` loop with spring smoothing that writes CSS variables and nothing else. It lights `.glass` surfaces where the cursor is, tilts anything with `data-tilt`, pulls `.magnetic` buttons, and drives `data-depth` parallax layers, all through CSS variables. It switches itself off for touch screens and reduced-motion users.

## Privacy and retention

- Private buckets; no public URLs; users have no direct storage policy. Everything goes through server-checked signed URLs.
- The free-report network counts keep only a salted hash of the visitor's network address.
- Source documents and refinement text are deleted `retention.sourceDocumentDays` (14) days after an order closes; reports after `retention.reportDays` (90). This depends on the cron job running with `CRON_SECRET` set; the admin Settings page shows whether it is.
- Analytics hooks (`lib/analytics.ts`) carry ids and enums only, never document content. No provider is wired yet.

## Security notes

Checked in this build:

- Service-role key only in `server-only` modules; admin pages and actions call `assertAdmin()` (role read from the database) before using it.
- RLS on every table; customers can't insert or update orders, results or payments; results hidden until `completed`.
- Daily limit enforced by an atomic Postgres function (tested: 12 parallel calls → exactly 3 succeed). The refund function is service-role only.
- Prices recomputed server-side; webhook verifies the Stripe signature and amount.
- Uploads: extension/MIME/size checked before issuing a single-path signed upload URL, then the stored object's real size and magic bytes are checked before checkout is allowed. Bucket-level limits as a backstop.
- UUID order ids; every file access re-checks ownership.
- No `dangerouslySetInnerHTML`; redirects restricted to same-site paths.

Still needed before production:

- A real end-to-end run against a Supabase project and Stripe test mode (this build was verified with lint, typecheck, production build, UI screenshots, and the SQL schema/RLS on local Postgres, but not against hosted Supabase Auth/Storage).
- Rate limiting on auth and order creation (e.g. Vercel firewall or Upstash).
- Malware scanning of uploads if volumes grow.
- Legal review of Terms and Privacy (PDPO) and the Turnitin licence question above.
- Orphaned unpaid orders: a cleanup for orders left in `awaiting_payment` with no upload.

## Future work

- `AuthorizedTurnitinProvider`, only if an officially permitted integration becomes available.
- Automatic matching of bank / FPS payments (manual confirmation today).
- Email to the customer when an order completes (owner notifications exist; customer emails don't yet).
- Customer-initiated account deletion.
