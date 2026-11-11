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

## 3. GitHub: the 15-minute schedule (free)

GitHub → the repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `ENGINE_URL` | the site's address, e.g. `https://consensa.vercel.app` |
| `ENGINE_CRON_SECRET` | the same value as in Vercel |

**Actions → PULSE cycle → Run workflow** runs one cycle on demand. Until step 4, each run is a free dry run: sample feeds, mock drafts, nothing saved.

## 4. The Claude key (costs money; only once zack says yes)

1. console.anthropic.com → **Settings → Limits**: set a monthly spend limit (suggested: $50). This is the hard stop.
2. **API Keys → Create key**, then add it in Vercel as `ANTHROPIC_API_KEY`.
3. In Vercel add `ENGINE_LIVE_FEEDS` = `1` and `ENGINE_MAX_DRAFTS` = `2`, then redeploy.

From then on, every 15 minutes the engine reads the real feeds, drafts at most 2 new stories with Claude, and saves them to Supabase. A draft costs about 4–6 US cents, which comes to about $1–3 on a normal day.

## 5. Reviewing drafts (no new screen)

Supabase → **Table Editor → engine_queue**, sorted by `priority`. Read `question_en`, `question_fr`, `flags` and `editor_note`, then change `status`:

- `approved`: goes live on the next cycle. Approving acknowledges the flags shown.
- `rejected` or `needsChanges`: stays in the audit log.

Drafts with a blocking flag arrive as `autoRejected` and can't be approved. Nothing can be deleted, and every change is logged in `engine_review_events`. Approved questions resolve automatically from their official source when the result is due. Anything uncertain shows `needsEditor` in `engine_resolutions`.

## 6. Showing live questions on the site (a separate switch, off)

`CONSENSA_LIVE_QUESTIONS=1` in Vercel makes each build include the published questions. Leave it off for now: until calls are stored on the server (accounts, M2), a live question would show 0 forecasters and a flat 50% line.

## Automatic results (no paid key needed)

Every cycle also settles the site's own Bank of Canada and Labour Force Survey questions from free official data
(the list is in `src/engine/site-results.ts`). This runs whenever `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set,
with or without the Claude key. A result needs two matching reads on separate cycles; anything doubtful goes to an
editor. Confirmed results are saved in `engine_resolutions`, the deploy hook rebuilds the site, and the build writes
them to `src/content/live-results.json`, where they replace any hand-written result for that question.
