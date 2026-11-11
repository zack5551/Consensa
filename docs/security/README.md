# Consensa security baseline (AEGIS)

*AEGIS, 2026-11-11. The security and privacy rules every change must meet. LEX owns the legal requirements
(`docs/legal/consensa-build-guardrails.md` and LEX's pre-launch checklist); this file turns them into engineering
rules. If a rule here and CLAUDE.md disagree, CLAUDE.md wins and this file gets fixed.*

## Already in place

- **Headers** (`next.config.ts`): HSTS (2 years, subdomains), `nosniff`, strict referrer, a Permissions-Policy that
  blocks camera, microphone, location and payment APIs, `Cross-Origin-Opener-Policy`, and a CSP that blocks plugins,
  `<base>` hijacking and off-site form posts. The app can't be framed; only `/embed/*` can.
- **Engine endpoint** (`/api/engine/cycle`): returns 404 until `ENGINE_CRON_SECRET` is set, then needs the secret as a
  bearer token, compared in constant time.
- **Engine tables** (`supabase/migrations/20261110000000_engine.sql`): RLS on with no policies, `anon` and
  `authenticated` revoked, deletes refused. Only the server's secret key reads them.
- **Feeds are untrusted**: size and item caps, Zod on every item, HTML stripped.
- **Server functions run in Montreal** (`vercel.json`, region `yul1`, next to Supabase in ca-central-1), so sign-in
  and account requests are handled in Canada. Middleware runs at Vercel's edge nearest the visitor (Toronto or
  Montreal for Canadians).
- **Secrets** live only in Vercel and GitHub settings. `.env*` is git-ignored. Nothing secret is `NEXT_PUBLIC_`.
- **Dependencies**: `pnpm audit` was clean on 2026-11-11.

## Rules for accounts and stored calls (must hold before the accounts PR merges)

1. **RLS on every table, deny by default.** Each table gets explicit policies; a user reads and writes only their own
   rows (`auth.uid() = user_id`). Public crowd numbers come from an aggregate view or function, never from
   readable `calls` rows. Write a test that the anon key can't read another user's call.
2. **The secret (service-role) key stays on the server.** Only `server-only` modules import it. The browser uses
   the publishable key and RLS does the work.
3. **No value can move.** No column, function or API transfers, gifts, buys or redeems points or scores; block it in
   the schema (no such function exists, and triggers refuse balance edits from clients).
4. **One person, one call per question:** a unique `(user_id, question_id)` constraint, and calls refuse writes after
   the close date (checked in the database, not only the UI).
5. **Delete and export** on the account screen. Export is that user's own data as JSON. Delete removes the account
   and personal data within 30 days and keeps only anonymous aggregates. Both are Law 25 rights.
6. **Collect the minimum.** 18+ stored as yes/no only, province not city, no birth date, no phone. Consents stored as
   separate rows with a timestamp and the wording version shown.
7. **Data stays in Canada.** Supabase in ca-central-1. Any new service that receives personal info (email sender,
   Sentry, ads) needs LEX's cross-border check first. Sentry scrubs personal info and IPs.
8. **Sign-in**: email magic link or passkey through Supabase Auth; no passwords stored by us. Rate-limit sign-in and
   call writes. Sessions in `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
9. **Validate everything with Zod** at the route boundary: params, bodies and anything read back from the database.
10. **Exports for partners are aggregates only**, with a minimum cell size, from a separate function that can't
    return a user id.
11. **Logs carry no personal info**: no emails, IPs or tokens in logs or error reports.
12. **Full CSP with nonces** (script-src) once pages render per request for accounts.

## Retention and incidents

- **Consent records** are removed 3 years after the consent ends, by the nightly `consensa-purge-expired-consents`
  pg_cron job (`supabase/migrations/20261111000400_retention_and_incidents.sql`). Nothing else deletes them.
- **Privacy incidents** go in `public.privacy_incidents` (dashboard only, secret key). Log every incident, even a
  small one. Entries are kept at least 5 years, and the original facts can't be rewritten. The steps to follow are
  in LEX's breach plan. The register lives in the database, not in this public repo, so no incident details are published.
- **Logs and backups** (Privacy Policy §8: 90 days for logs and errors, 30 days for backups) are set in the Supabase and
  Vercel dashboards, not in code. Check them before launch.

## Before launch (AEGIS + LEX)

- Privacy impact assessment and the cross-border check for every provider (LEX items 6 and 1).
- Breach plan: an internal incident register, and who notifies the CAI, the Privacy Commissioner and users (LEX item 8).
- Turn on GitHub secret scanning, push protection and Dependabot alerts (repo settings; the repo is public).
- Branch protection on `main`: CI required before merge.
- `pnpm audit` clean, and a quick check of the live site's headers.
