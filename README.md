# Proofline

A pre-submission service for students checking their own academic writing. It offers three separate services:

| Service | What it is | Where the result comes from |
| --- | --- | --- |
| **Preliminary Scan** (free, 3/day) | Instant writing-pattern analysis | This website (`HeuristicWritingAnalyzer`) |
| **AI & Similarity Screening** (paid) | Human-processed screening | A person runs the document through Turnitin outside this app and records exactly what it returned |
| **Writing Refinement** (paid) | Human clarity/style editing of the author's own text | A reviewer |

The UI keeps these apart everywhere: free-scan results are labelled "Preliminary risk estimate · not a Turnitin result"; screening results are labelled as the observed result of that screening run. Missing values are shown as "Not returned", never estimated.

> Turnitin is a third-party service. This platform is independently operated and is not affiliated with, endorsed by, or operated by Turnitin. The app contains no Turnitin branding, UI, credentials, scraping or automation.

The brand name "Proofline" is a placeholder. Rename it in `config/app.ts`.

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
| `lib/payments/` | Stripe client and `markOrderPaid` (idempotent, amount-checked). |
| `app/actions/` | Server actions: scan, orders, admin, account. |
| `app/api/files/[kind]/[orderId]` | Access-checked 60-second signed URLs for source files and reports. |
| `app/api/stripe/webhook` | The only way a real order becomes paid. |
| `app/api/cron/retention` | Scheduled deletion of old documents and reports. |
| `supabase/migrations/0001_init.sql` | Tables, constraints, indexes, RLS, storage buckets and policies. |

### Order statuses

Screening: `awaiting_payment → paid → queued → screening → report_ready → completed` (or `cancelled`)
Refinement: `awaiting_payment → paid → queued → under_review → processing → completed` (or `cancelled`)

`paid` is set only by the webhook. Customers see results only when an order is `completed` (enforced by RLS, not just the UI).

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

FPS, PayMe or bank transfer can be added later as another path into `markOrderPaid`; none is faked here.

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

## Admin workflow

1. Paid orders land in **Admin → Overview → Work queue** (oldest first).
2. Open the order. Download the source file (60-second signed link, logged).
3. **Checklist:** confirm the Turnitin assignment is set to *no repository*. Required before moving to **Screening**.
4. Move to **Screening** and perform the screening in Turnitin, outside this app.
5. Enter what was returned: AI-writing indicator and/or similarity %, leaving blank anything not returned (with a note if the AI indicator was withheld). Upload the report PDF/DOCX.
6. Move to **Report ready** (the app checks the requested values or a reason are present), review, then **Complete & release**. The customer can now see the result.
7. Tick "removed from the external workspace" once done.

Every step writes to `audit_events`.

## Preliminary analyzer

`HeuristicWritingAnalyzer` computes six explainable signals from the text itself: sentence-length variation, sentence-opening repetition, connector frequency, stock phrasing and repeated trigrams, moving-average type–token ratio, and paragraph-length variation. It returns a level (Low / Moderate / Elevated) and per-signal measurements, not an "AI %". Add another implementation (model, LLM rubric, external API) behind `WritingAnalyzer` and select it with `WRITING_ANALYZER`. `metadata.isMock` exists so any future development mock is never shown as real analysis.

## Privacy and retention

- Private buckets; no public URLs; users have no direct storage policy. Everything goes through server-checked signed URLs.
- Free-scan text is not stored (`retention.storeScanText = false`); only scores are.
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
- FPS / PayMe payment paths.
- Email notifications when an order completes.
- Customer-initiated account deletion.
