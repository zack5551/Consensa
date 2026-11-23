# Social voting: going live (FORGE, 2026-11-20)

Social voting is built and switched **off**. This page lists every step to switch it on, in order, so the last
step is one switch. Don't skip ahead: each step assumes the ones before it are done. AEGIS's conditions are in
project memory (social-voting go-live checklist), and LEX's rules are in `/mnt/project-files/legal/social-voting-rules.md`.

**What goes live first: X.** Replies on our own X posts count in "Canada says" once the person has linked their X
account. Meta stopped letting apps sign in ordinary Instagram accounts in December 2024 (only business and creator
accounts can), so Instagram replies can't be tied to a CANsensus account yet. Instagram poll results can still be
shown under "On social media", typed in by hand, with the line "Not verified. May include people outside Canada and
under 18." Typed-in totals never count in "Canada says". Facebook Login still works for personal accounts, but the id
it gives is app-scoped and isn't proven to match the id on a comment (AEGIS note 3), so Facebook waits too. Threads
waits for Meta's app review.

## 1. Before anything else
- [ ] LEX has passed the social-voting rules.
- [ ] AEGIS has passed the last PR touching social voting.
- [ ] The Privacy Policy linked-account rows (EN and FR) and the Terms §2 line are live on the site, with a new
      "last updated" date, a notice banner and a new consent-log version. It's an opt-in feature, so no 30-day wait.
      The rows are already on main but only show once `SOCIAL_VOTING=1`. FORGE ships a small PR for switch day: the
      new "last updated" date and changelog line, the "Privacy Policy updated" banner, and the version seen in the
      consent log (no TERMS_VERSION bump).
- [ ] zack signs off on LEX rule 7 for the X data flow (X is in the US; data only comes in, to Montréal).
- [ ] zack OKs the X read cost (it breaks the free-only rule; see `X_MONTHLY_CAP_USD` below).
- [ ] The election polling-day freeze is built, or political questions take no social replies until it is.
- [ ] AEGIS confirms the unticked consent box, the separate username opt-in, one-click unlink and the monthly
      Canada and VPN re-check.

## 2. The database (zack, in the Supabase SQL editor)
Open the SQL editor: https://supabase.com/dashboard/project/_/sql/new. For each file, open it on GitHub, use the
"Copy raw file" icon next to Raw, paste it into a new query, and press Run. Run them in this order, one at a time:

1. `supabase/migrations/20261119000000_social_voting.sql`
2. `supabase/migrations/20261120000000_social_sweep_approval.sql`
3. `supabase/migrations/20261120001000_social_sweep_withdrawals.sql`
4. `supabase/migrations/20261121000000_social_poll_finder.sql`

Then paste `supabase/checks/social_voting_ready.sql` and press Run. It only looks and changes nothing. Every row
must say `true`. If a row says `false`, its `step` column names the file above that didn't run.

## 3. X (zack)
- [ ] Open a developer account at https://developer.x.com and create a project and an app.
- [ ] Turn on OAuth 2.0 for the app, as a "Web App". Callback URL: `https://consensa-omega.vercel.app/api/account/social/callback`.
- [ ] Make the official @CANsensus posts that questions will point to. For a poll, post it by hand like any X poll:
      two choices, "Yes" and "No" (or "Oui" and "Non"), and the question's CANsensus link in the post
      (`…/en/q/<question>` or `…/fr/q/<question>`). The daily run finds it on its own (it reads our 10 latest posts
      from the last 8 days), and the totals show on that question under "On social media". One question link per
      post. Sports polls must end before the game starts. Nothing needs adding to the questions by hand.
      Every post carries "Free. No prizes." Sports posts also carry "Fan forecasts only." and the line saying we
      aren't affiliated with the league or teams, and go up before the game only.

## 3b. Facebook, Instagram and Threads totals (zack, later)
These show under "On social media" only, never in "Canada says". They need a free Meta developer app linked to the
CANsensus Page, the Instagram professional account and the Threads account, and Meta's review of
`pages_read_engagement` + `pages_read_user_content` (Facebook reactions and comments), `instagram_basic` + `instagram_manage_comments`, and `threads_basic`. Before Instagram
or Facebook comments are counted, the Privacy Policy row on counting YES/NO comments and reactions goes in, and the PIA
gets rows for all three (LEX).
- [ ] **Threads:** post a poll with two options, "Yes" and "No" (or "Oui" and "Non"), and the question's link.
- [ ] **Facebook:** Facebook has no poll an app can read. Post on the Page: "React 👍 for yes or 😮 for no, or
      comment ✅ YES or ❌ NO", with the question's link. Each person counts once: their latest vote comment if they
      left one, otherwise their reaction. Reactions and comments are read and counted in memory; no name, text or id
      is kept. Check after app review that Meta gives a person id on reactions and comments (if it hides one on a vote, the post shows nothing), and that one real post's totals match what Facebook shows (AEGIS). LEX: Meta treats "react to vote" posts as engagement bait, which can cut a post's reach,
      so try one post first and check Meta's current guidance.
- [ ] **Instagram:** a post with a Yes/No poll if the app offers one; otherwise ask for YES or NO in the comments.
      Comments are read and counted in memory, one per account; no name, text or id is kept.
- [ ] The daily run reads each account's latest 25 posts from the last 8 days and ties a post to a question by its link.
      Reactions and comments are read only on a post that asks for them as our texts do (Facebook: both 👍 and 😮
      named; Instagram: "YES or NO" / "OUI ou NON" in capitals), so a plain post with the link never shows as a vote.

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
| `X_ACCOUNT_ID` | Optional: @CANsensus's numeric X id. Saves one paid lookup a day. |
| `META_PAGE_TOKEN` | Later, after Meta's review: the CANsensus Page's token (Facebook reactions). |
| `META_INSTAGRAM_TOKEN`, `META_INSTAGRAM_ID` | Later: the Instagram professional account's token and id. |
| `META_THREADS_TOKEN` | Later: the Threads account's token. |

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
