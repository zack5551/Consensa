# Turning PULSE on

Everything here is done in dashboards. Secrets go into Supabase, Vercel and GitHub settings, never into the repo or a chat.

## 1. Supabase: create the tables (free)

1. Supabase → your project (Canada Central) → **SQL Editor** → **New query**.
2. Paste all of `supabase/migrations/20261110000000_engine.sql` and click **Run**. It's safe to run again.
3. **Project Settings → API Keys**: you'll copy the **Project URL** and a **secret key** (`sb_secret_…`) in step 2. The legacy `service_role` key also works. Never use either one in the browser.

## 2. Vercel: environment variables

Vercel → the Consensa project → **Settings → Environment Variables**, scope **Production**:

| Name | Value |
|---|---|
| `SUPABASE_URL` | Project URL from Supabase |
| `SUPABASE_SECRET_KEY` | the secret key from Supabase |
| `ENGINE_CRON_SECRET` | 32+ random characters (a password manager's generator, or `openssl rand -hex 32`) |
| `VERCEL_DEPLOY_HOOK_URL` | **Settings → Git → Deploy Hooks** → create one named `pulse` on branch `main`, then copy its URL |

Redeploy once so the variables take effect.

## 3. The schedule (free): Vercel Cron, or GitHub every 15 minutes

**Vercel Cron (the one in use).** `vercel.json` asks Vercel to call `/api/engine/cycle` once a day at 15:00 UTC (10:00 ET in winter), after the Bank of Canada and Statistics Canada morning releases. It needs one variable: Vercel → **Settings → Environment Variables** → Name `CRON_SECRET`, Value 32+ random characters, scope Production, then redeploy. Vercel sends it as a bearer token, and the endpoint stays off (404) until it is set. Vercel Cron runs on the production deployment and isn't blocked by Deployment Protection. Check runs under **Settings → Cron Jobs → View Logs**. A result settles after two matching reads, so with one run a day it shows on the site about two days after the official release.

**GitHub Actions (optional, every 15 minutes).**

GitHub → the repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `ENGINE_URL` | the site's production address, `https://consensa-omega.vercel.app` |
| `ENGINE_CRON_SECRET` | the same value as in Vercel |

**Actions → PULSE cycle → Run workflow** runs one cycle on demand. Until step 4, each run is a free dry run: sample feeds, mock drafts, nothing saved.

## 4. The Claude key (costs money; only once zack says yes)

1. console.anthropic.com → **Settings → Limits**: set a monthly spend limit (suggested: $50). This is the hard stop.
2. **API Keys → Create key**, then add it in Vercel as `ANTHROPIC_API_KEY`.
3. In Vercel add `ENGINE_LIVE_FEEDS` = `1`, then redeploy. Leave `ENGINE_MAX_DRAFTS` unset (default 12 writer calls per run); an older setup suggested `2`, which starves the four desks, so delete it if it's there.

From then on, each run reads the real feeds, and the four writing desks (economy and housing, weather and science, culture and trends, sports) each aim to queue 2 questions, falling back on the official release calendar when the news is thin. The checker rates every queued draft. See "Cost" in `README.md`: about US$0.40–0.75 a run, so about US$12–23 a month with the daily schedule.

## 4b. Editor emails (Amazon SES in Montréal, optional but recommended)

After each real run PULSE emails a short summary (new drafts, flagged drafts, errors, open questions on the site), and a separate alert if a run fails. Drafts the checker rates 7/10 or higher are listed first. Without these settings everything still runs; it just sends nothing.

1. Create an AWS account (needs a card; SES costs about US$0.10 per 1,000 emails): https://signin.aws.amazon.com/signup?request_type=register
2. SES in Montréal → **Identities → Create identity → Email address**, enter the editor's address, then click the link AWS emails you: https://ca-central-1.console.aws.amazon.com/ses/home?region=ca-central-1#/identities. A new account starts in SES's "sandbox", which can only send to verified addresses. That's fine here: PULSE sends from and to that one verified address.
3. IAM → **Users → Create user** named `pulse-mailer`, no console access: https://us-east-1.console.aws.amazon.com/iam/home#/users/create. Open the user → **Add permissions → Create inline policy → JSON**, paste the policy below, name it `send-email-only`:
   ```json
   { "Version": "2012-10-17", "Statement": [{ "Effect": "Allow", "Action": "ses:SendEmail", "Resource": "*", "Condition": { "StringEquals": { "aws:RequestedRegion": "ca-central-1" } } }] }
   ```
4. Same user → **Security credentials → Create access key → Application running outside AWS**. Keep the page open for step 5.
5. Vercel → Settings → Environment Variables (Production), then redeploy:

| Name | Value |
|---|---|
| `SES_ACCESS_KEY_ID` | the access key from step 4 |
| `SES_SECRET_ACCESS_KEY` | the secret access key from step 4 (mark it Sensitive) |
| `ENGINE_ALERT_EMAIL` | the address verified in step 2 |
| `ENGINE_CHECK_THRESHOLD` | optional, 1–10, default `7`: the checker's flag line |

The emails carry draft questions written from public news, risk scores and run counts. No user data.

## 5. Reviewing drafts

**Auto-approve (on by default, zack 2026-11-25).** A draft goes straight to `approved` (and is published in the same run) only when all of these hold: the checker rated it, every area is under the flag line (7), legal, gambling and sensitive are 4 or less, it isn't sports, and it has no flag that needs a person (elections, trading, minors, disaster and every blocking flag hold it; a manual result check doesn't). Its history shows `pulse-auto` and its `PULSE:` note says why. To send every draft to a person instead, set `ENGINE_AUTO_APPROVE` = `0` in Vercel and redeploy.

**The review page.** Each summary email has a "Review and approve" link (`/api/engine/review?t=…`), signed with `CRON_SECRET` and good for 7 days. It lists every draft still waiting, flagged first, with EN and FR, the risk scores and Approve / Reject buttons. Opening it changes nothing; only the buttons do. It needs `CRON_SECRET` and the Supabase settings, and shows 404 without them.

Or in Supabase directly:
Supabase → **Table Editor → engine_queue**, sorted by `priority`. Read `question_en`, `question_fr`, `flags` and `editor_note`, then change `status`. A `check-risk` flag means the checker rated the draft 7/10 or more in some area; its detail says which and why. `check-unavailable` means the checker couldn't rate it.

- `approved`: goes live on the next cycle. Approving acknowledges the flags shown.
- `rejected` or `needsChanges`: stays in the audit log.

Drafts with a blocking flag arrive as `autoRejected` and can't be approved. Nothing can be deleted, and every change is logged in `engine_review_events`. Approved questions resolve automatically from their official source when the result is due. Anything uncertain shows `needsEditor` in `engine_resolutions`.

**PULSE explains every call.** `editor_note` ends with a `PULSE:` line saying what the engine did and why: the story it wrote from (heat, how many reports and sources), how the question settles, and which flags to check, or why it was blocked. Each row in `engine_resolutions` has `record → why`: what the official source read, whether it is waiting for a second matching read, why it settled, or why it needs an editor. The notes are written from the data, not by the model, so they cost nothing.

## 6. Showing live questions on the site (a separate switch, off)

`CONSENSA_LIVE_QUESTIONS=1` in Vercel makes each build include the published questions. Leave it off for now: until calls are stored on the server (accounts, M2), a live question would show 0 forecasters and a flat 50% line.

## Automatic results (no paid key needed)

Every cycle also settles the site's own Bank of Canada and Labour Force Survey questions from free official data
(the list is in `src/engine/site-results.ts`). This runs whenever `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set,
with or without the Claude key. A result needs two matching reads on separate cycles; anything doubtful goes to an
editor. Confirmed results are saved in `engine_resolutions`, the deploy hook rebuilds the site, and the build writes
them to `src/content/live-results.json`, where they replace any hand-written result for that question.
