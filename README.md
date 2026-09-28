# 0%

A pre-submission service for students checking their own academic writing. It offers three separate services:

| Service | What it is | Where the result comes from |
| --- | --- | --- |
| **Preliminary Scan** (free, 3/day) | Instant writing-pattern analysis | This website (`HeuristicWritingAnalyzer`) |
| **AI & Similarity Report** (Turnitin screening run by staff, HK$35, 450–29,000 words) | Human-processed screening of pasted text | A person runs the text through Turnitin outside this app and records exactly what it returned |
| **Writing Refinement** (HK$1 per 100 characters, min HK$30) | Human clarity/flow/style refinement of the author's own text | A reviewer |

The UI keeps these apart everywhere: free-scan results are labelled "Preliminary risk estimate · not a Turnitin result"; screening results are labelled as the observed result of that screening run. Missing values are shown as "Not returned", never estimated.

> Turnitin is a third-party service. This platform is independently operated and is not affiliated with, endorsed by, or operated by Turnitin. The app contains no Turnitin branding, UI, credentials, scraping or automation.

The brand name is "0%". Rename it in `config/app.ts` (`brand`); nothing else hard-codes it.

---

## Before launch: two things to confirm

1. **Licence.** Turnitin educator/institutional licences usually limit use to the licensee's own courses and students. Screening documents for paying outside customers through that account may breach the licence and the institution's agreement, regardless of disclaimers on this site. Get written permission from Turnitin or the institution first. The provider sits behind the `ScreeningProvider` interface, so a properly licensed source can be swapped in without touching the frontend.
2. **Repository storage.** If a paper is submitted to an assignment that stores papers in the standard repository, the customer's real submission later matches itself at close to 100%. The admin workflow blocks moving an order to **Screening** until the "no repository" checkbox is confirmed, and the FAQ explains this to customers.

---

## Architecture

```
USER ─► NEXT.JS (App Router)
          ├─ Preliminary analysis ─ WritingAnalyzer ─► scan_results
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
| `lib/scanning/` | `WritingAnalyzer` interface, `HeuristicWritingAnalyzer`, and `canUserScan` / `getRemainingScans` / `incrementScanUsage`. |
| `lib/screening/` | `ScreeningProvider` interface and `ManualTurnitinProvider` (human-in-the-loop). |
| `lib/payments/` | Stripe client and `markOrderPaid` (idempotent, amount-checked), used by the webhook and by admin claim confirmation. |
| `config/payments.ts` | Alipay / PayMe / bank transfer payee details, QR paths and instructions. |
| `app/actions/` | Server actions: scan, orders, admin, account. |
| `app/api/files/[kind]/[orderId]` | Access-checked 60-second signed URLs for source files and reports. |
| `app/api/stripe/webhook` | Marks card orders paid (signature- and amount-checked). Manual payments are confirmed by an admin; see [Payments](#payments). |
| `app/api/cron/retention` | Scheduled deletion of old documents and reports. |
| `supabase/migrations/0001_init.sql` | Tables, constraints, indexes, RLS, storage buckets and policies. |
| `lib/local-model/`, `app/api/model-worker/`, `tools/local-model-worker/` | Optional local writing model: job queue, worker API and the worker program. See [Local writing model](#local-writing-model). |

### Order statuses

Screening: `awaiting_payment → paid → queued → screening → report_ready → completed` (or `cancelled`)
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
2. Apply the schema: `supabase db push` (with the Supabase CLI linked), or paste `supabase/migrations/0001_init.sql` into the SQL editor. This creates the private `documents` and `reports` buckets with size and MIME limits.
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
| AI & Similarity Report (`combined_screening`) | HK$35 per report (`screeningPrices`) | 450–29,000 words (`screeningWordRange`), checked in the browser and again in `screeningTextOrderInput` |
| Writing Refinement (`refinement`) | HK$1 per 100 characters, rounded up, minimum HK$30 = 3,000 characters (`refinementPricing`, `refinementPrice(billableChars(text))`) | 200–60,000 characters per order (`config/app.ts` → `refinement`) |
| Preliminary scan | Free, 3 a day | — |

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

Customers can never mark an order paid; only a verified Stripe webhook or an admin confirming a claim can. Refunds happen outside the app.

**Set your payee details before launch** in `config/payments.ts`: replace every value starting with `REPLACE`, set `enabled` per method, and put QR images at `public/payments/alipay-qr.png` and `public/payments/payme-qr.png` (or set `qrImage: null`). Missing images show a neutral frame. **Admin → Settings** lists any method still using placeholders.

## Owner notifications

`lib/notify.ts` sends you a message by Telegram and/or email (Resend), after the response so it never slows the customer down:

| Event | When |
| --- | --- |
| `order_created` | A report or refinement order is created |
| `payment_submitted` | A customer reports an Alipay / PayMe / bank payment (check your account) |
| `payment_confirmed` | You confirm a claim, or Stripe confirms a card payment |
| `payment_rejected` | You reject a claim |
| `scan_used` | A free scan is run. Telegram only, so anonymous scans can't use up the email quota payment alerts need |
| `scan_digest` | Once a day (retention job): yesterday's free-scan total, by email only |

`NOTIFY_ON_SCANS=false` turns off both scan events.

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

## Preliminary analyzer

`HeuristicWritingAnalyzer` computes six explainable signals from the text itself: sentence-length variation, sentence-opening repetition, connector frequency, stock phrasing and repeated trigrams, moving-average type–token ratio, and paragraph-length variation. It returns a level (Low / Moderate / Elevated) and per-signal measurements, not an "AI %". Add another implementation (model, LLM rubric, external API) behind `WritingAnalyzer` and select it with `WRITING_ANALYZER`. `metadata.isMock` exists so any future development mock is never shown as real analysis.

It also returns sentence-level highlights (which patterns each sentence contains) and readability measures (Flesch reading ease, Flesch–Kincaid grade, sentence length, reading time). Highlights contain the user's text, so `forStorage()` strips them, and paragraph excerpts, before a result is saved; scan history keeps scores only.

The free scan accepts .docx, .pdf and .txt files. Text is extracted in the browser (`lib/extract-text.ts`, mammoth and unpdf), so the file itself is never uploaded. Results can be saved as a PDF through the browser's print dialog (print styles in `globals.css`).

## Local writing model

The owner's own model, served by Open WebUI on the owner's computer, can write feedback under free scans and first drafts of refinement orders. Everything is off until `MODEL_WORKER_SECRET` (24+ characters) is set.

```
browser ─► runScan ─► model_jobs (queued) ◄── poll ── worker on owner's PC ─► Open WebUI ─► local model
   ▲                                    └── result ──┘
   └── /api/scan-feedback/[id] (read once, then deleted)
```

- **Pull, not push.** `tools/local-model-worker/worker.mjs` (Node 18+, no packages) polls `POST /api/model-worker/next` and reports to `POST /api/model-worker/jobs/[id]`, authenticated with `Authorization: Bearer $MODEL_WORKER_SECRET` (constant-time check). The owner's computer only makes outgoing requests. Each poll is a heartbeat (`model_worker.last_seen_at`).
- **Queue:** migration `0003`. `claim_model_job` hands out one job at a time (`for update skip locked`), scan feedback first, and requeues a draft whose worker stopped reporting progress for 20 minutes (up to three tries). Service role only.
- **Scan feedback** is queued only while the worker was seen in the last `localModel.onlineWindowSeconds` (45 s) and fewer than `maxQueuedFeedback` are waiting, so the report never waits on it. The text is cleared from the row when the worker claims it; the feedback is deleted when the browser reads it or after `scanFeedbackMinutes` (10). The UI labels it as model-written writing feedback; it never judges AI authorship or gives a score.
- **Refinement drafts** are queued when an order is paid (`markOrderPaid`) or from the admin order page. The worker reads the text from the order at claim time (it is never copied into the job), writes it in chunks of `CHUNK_CHARS`, and between chunks answers waiting scan feedback. The admin loads the draft into the revision editor and reviews it; the customer sees only what the admin saves and releases. Drafts are deleted with the order's text by the retention cron.
- **Prompts** live in `lib/local-model/prompts.ts`, not in the worker, so the rules ship with the site: clarity, grammar and flow only; keep meaning, citations and voice; nothing about AI detection or evading it.
- The privacy page says the model runs on equipment the operator controls and text doesn't go to an outside AI provider. That's only true if `OPENWEBUI_MODEL` is a local model; change the page before using a cloud model.

Setup (in Traditional Chinese for the owner): `tools/local-model-worker/README.md`.

## Guest scans

The free scan lives at `/scan` in its own route group, `app/(scan)`, so visitors can use it without an account: guests see the marketing navbar, signed-in users see the app sidebar. Opening a saved scan (`/scan?id=…`) and `/scan/history` still require sign-in (`lib/supabase/proxy.ts`).

Guests get `freeScan.dailyLimit` (3) scans per Hong Kong calendar day per network address (`lib/scanning/guest.ts`, migration `0002`):

- The address comes from the first `x-forwarded-for` entry, else `x-real-ip`, and only on a host that overwrites them: Vercel (detected from `VERCEL`), or another host where you set `TRUST_PROXY_IP_HEADERS=true` because its proxy replaces any value the visitor sends. Elsewhere these headers can be forged, so they are ignored.
- IPv6 counts per /64, because one device can rotate through addresses inside its /64.
- Without a trusted header, all guests share one `unknown` bucket, so the limit fails closed.
- Known limit: someone with a routed IPv6 block larger than a /64 can get more than 3 a day. The cost is only server time for the heuristic scan (scan messages go to Telegram, not the email quota). Add a platform rate limit (Vercel Firewall) if it happens.
- Only a salted SHA-256 of the address is stored (`GUEST_IP_SALT`, or a value derived from the service-role key when unset). Neither the address nor the hash is logged.
- Counting is an atomic Postgres function callable only by the service role; a failed scan refunds its use. Yesterday's rows are deleted by the retention cron.
- People behind one shared address (a school network, mobile carrier NAT) share one allowance. Signing in gives each person their own 3 a day.

## Interaction design

`components/motion/interactive-surfaces.tsx` mounts one pointer engine (`components/motion/pointer-engine.ts`) for the whole site: a single `requestAnimationFrame` loop with spring smoothing that writes CSS variables and nothing else. It lights `.glass` surfaces where the cursor is, tilts anything with `data-tilt`, pulls `.magnetic` buttons, and drives `data-depth` parallax layers, all through CSS variables. It switches itself off for touch screens and reduced-motion users.

## Privacy and retention

- Private buckets; no public URLs; users have no direct storage policy. Everything goes through server-checked signed URLs.
- Free-scan text is not stored (`retention.storeScanText = false`); only scores are. With the local model on, it sits in `model_jobs` only until the worker claims it, and the feedback until the browser reads it (10 minutes at most).
- Guest scan counts keep only a salted hash of the visitor's network address, and each day's rows are deleted by the retention cron the next day.
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
