# Accounts: setup

Real sign-in uses Supabase Auth in the Montreal project (ca-central-1), the same project PULSE uses. Without the
two public values below, the app stays in preview mode: calls stay in the browser and no email is sent. CI runs
in preview mode.

## One-time setup (zack, about 5 minutes)

1. **Run the migrations, in order.** Supabase dashboard → SQL Editor → New query → paste each file → Run.
   Each one is safe to run again.
   - `supabase/migrations/20261111000000_accounts.sql` (accounts, calls, consent log)
   - `supabase/migrations/20261111000100_crowd.sql` (the crowd totals the server reads)
   - `supabase/migrations/20261111000200_call_rules.sql` (no calls after close, one change per 2 seconds)
   - `supabase/migrations/20261111000300_consent_retention.sql` (consents end on account deletion, 3-year purge)
2. **Allow our sign-in links.** Authentication → URL Configuration:
   - Site URL: the production URL (for example `https://consensa.vercel.app`).
   - Redirect URLs: add `https://*-consensa.vercel.app/api/auth/callback` (previews) and
     `https://<production domain>/api/auth/callback`.
3. **Email sign-in only.** Authentication → Sign In / Providers → Email: on. The magic link confirms the address,
   so nothing else needs changing.
4. **Vercel env vars** (Project → Settings → Environment Variables, Production and Preview). Copy them from
   Supabase → Project Settings → API Keys. Never paste keys into chat.
   - `NEXT_PUBLIC_SUPABASE_URL`: the project URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the publishable key (safe in the browser; RLS protects the data).
   - `SUPABASE_SECRET_KEY`: already set for PULSE. Server only.
5. Redeploy.
6. **Check the security rules.** SQL Editor → paste `supabase/tests/rls_check.sql` → Run. It should say
   "RLS check passed" and leaves nothing behind.

Supabase's built-in email sender is limited to a few emails an hour. That is fine for a demo; before launch,
set a custom SMTP sender on the consensa.ca domain (Authentication → Emails → SMTP).

## How it works

- **Signup** happens at the end of onboarding: the email link creates the account. The database trigger refuses
  any account without the 18+ yes and the terms. Each consent is its own row in an append-only `consent_log`
  (wording version, given and withdrawn times), keyed by an email hash only, so it outlives account deletion as
  CASL proof. Deleting an account ends its open consents; `purge_expired_consents()` (server only) removes a row
  3 years after its consent ended, and nothing else can delete one.
- **Sign in** never creates an account, and answers the same way whether or not the address has one.
- **Calls** are written by the server only (secret key) after it checks the session, the question and a
  30-a-minute limit per person. The database itself refuses a call after the question's close time
  (`question_windows`, filled by the server from the question content) and a change to the same call within
  2 seconds. People can read their own rows and nothing else (RLS).
- **"Canada says"** comes from real calls once 5 or more people have called a question; below that the sample
  numbers stay. The server reads totals through `crowd_summary` (server only), never anyone's single call.
- **Delete my account** (PR after that) removes the auth user; their profile and calls go with it by cascade (Law 25).
