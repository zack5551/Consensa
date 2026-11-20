# Social voting: going live (FORGE, 2026-11-20)

Social voting is built and switched **off**. This page lists every step to switch it on, in order, so the last
step is one switch. Don't skip ahead: each step assumes the ones before it are done. AEGIS's conditions are in
project memory (social-voting go-live checklist), and LEX's rules are in `/mnt/project-files/legal/social-voting-rules.md`.

**What goes live first: X.** Replies on our own X posts count in "Canada says" once the person has linked their X
account. Meta stopped letting apps sign in ordinary Instagram accounts in December 2024 (only business and creator
accounts can), so Instagram replies can't be tied to a CANsensus account yet. Instagram poll results can still be
shown under "On social media", typed in by hand. Facebook and Threads are in the same position.

## 1. Before anything else
- [ ] LEX has passed the social-voting rules.
- [ ] AEGIS has passed the last PR touching social voting.

## 2. The database (zack, in the Supabase SQL editor)
Open the SQL editor: https://supabase.com/dashboard/project/_/sql/new. For each file, open it on GitHub, use the
"Copy raw file" icon next to Raw, paste it into a new query, and press Run. Run them in this order, one at a time:

1. `supabase/migrations/20261119000000_social_voting.sql`
2. `supabase/migrations/20261120000000_social_sweep_approval.sql`
3. `supabase/migrations/20261120001000_social_sweep_withdrawals.sql`

Then paste `supabase/checks/social_voting_ready.sql` and press Run. It only looks and changes nothing. Every row
must say `true`. If a row says `false`, its `step` column names the file above that didn't run.

## 3. X (zack)
- [ ] Open a developer account at https://developer.x.com and create a project and an app.
- [ ] Turn on OAuth 2.0 for the app, as a "Web App". Callback URL: `https://consensa-omega.vercel.app/api/account/social/callback`.
- [ ] Make the official @CANsensus posts that questions will point to. FORGE adds their ids to the questions.

## 4. Settings in Vercel (zack)
Open https://vercel.com/consensa/consensa/settings/environment-variables. Add each one as its own variable. Never
paste the values into a chat.

| Name | What it is |
| --- | --- |
| `SOCIAL_LINK_SECRET` | A long random string, at least 32 characters. Generate it with a password manager. |
| `X_CLIENT_ID` | From the X app's "Keys and tokens" page (OAuth 2.0 Client ID). |
| `X_CLIENT_SECRET` | From the same page (OAuth 2.0 Client Secret). |
| `X_BEARER_TOKEN` | From the same page (Bearer Token). |
| `X_MONTHLY_CAP_USD` | The most X reads may cost in a month, in US dollars, for example `5`. At 0, nothing is read. |

Leave `SOCIAL_AUTO_REPLY` unset. It posts publicly, so it stays off until zack says yes.
Never set `CONSENSA_TEST_FIXTURES` in Vercel.

## 5. The switch
Add `SOCIAL_VOTING` = `1`, then redeploy (https://vercel.com/consensa/consensa/deployments, "Redeploy" on the latest).

The next daily run (10 a.m. ET) logs one line for each setting that is still missing, by name only:
`social-voting: missing-link-secret`, `missing-x-link`, `missing-x-read`, `missing-x-cap` or `missing-database`.
No such line means everything is set. Check https://vercel.com/consensa/consensa/logs the day after.

To switch off: set `SOCIAL_VOTING` to `0` (or delete it) and redeploy. Nothing is lost; links and counted calls stay.

## Day to day
- A halted clean-up sweep logs `social-sweep: halted`. To let one run go ahead, run
  `select public.approve_social_sweep('zack', 'why');` in the SQL editor.
- To put back a reply that was taken out by mistake (within 7 days):
  `select public.restore_social_reply('x', '<reply id>', 'zack');`
