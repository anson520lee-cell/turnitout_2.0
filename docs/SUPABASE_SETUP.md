# Connecting accounts (Supabase)

**Status 2026-10-05:** project `zero-percent` (Singapore) is already created and all four migrations are applied. Only steps 3–5 below remain (they need your dashboard / Vercel).

(Steps 1–2 are only needed if you ever make a fresh project.)

Until this is done, sign-up/login show "Getting accounts ready" and report/refinement orders can't be submitted. The free scan works either way.

## 1. Create the project
1. supabase.com → New project (any name, pick a region near Hong Kong, e.g. Singapore). Save the database password somewhere safe.
2. Wait about 2 minutes until it says "Healthy".

## 2. Create the tables (one paste, only for a fresh project)
1. Left menu → **SQL Editor** → **New query**.
2. Open `supabase/setup.sql` in this repo, copy everything, paste, press **Run**. Run it **once only**.
3. You should see "Success. No rows returned". (This makes tables, security rules and the private file buckets.)

## 3. Sign-in settings
Authentication → **URL Configuration**:
- Site URL: your real site address (e.g. `https://yourdomain.com`)
- Redirect URLs: add `https://yourdomain.com/auth/callback` and `https://yourdomain.com/auth/confirm` (plus the Vercel preview address if you test there).

Authentication → **Providers → Email**: to let people in without a confirmation email, turn **Confirm email** off. Leave it on if you want to verify emails.

## 4. Copy three values into Vercel
Supabase → Project Settings → **API**. Vercel → your project → Settings → **Environment Variables** (tick Production and Preview):

| Vercel name | Supabase value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (secret, never share it) |

Also set `NEXT_PUBLIC_APP_URL` to your real site address. Then **Redeploy** (Deployments → ⋯ → Redeploy). Env changes only apply after a redeploy.

## 5. Make yourself admin
Sign up on the site once, then in SQL Editor run:
```sql
update public.profiles set role = 'admin' where email = 'your-email@example.com';
```

## Check it works
Sign up → you land logged in → open Get a report → paste text → Enter → you reach the payment page. Admin appears under /admin.
