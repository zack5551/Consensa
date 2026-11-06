# PULSE: the question engine

Owner: PULSE. Code: `src/engine/`. Tests: `tests/unit/engine/`.

PULSE keeps Consensa's slate fresh. Every 15 minutes it reads what Canada is talking about, finds the stories that can become a fair, checkable forecast, drafts each one in English and Quebec French with Claude, checks it, and puts it in front of an editor. Once a question is live, PULSE reads the official source when the result is due and settles it. **Nothing an AI writes reaches forecasters without a person approving it.**

## The cycle

```
 feeds ─▶ signals ─▶ stories ─▶ story screen ─▶ pick ─▶ draft (Claude) ─▶ checks ─▶ review queue ─▶ editor ─▶ published
 (RSS,     (validated  (clustered,  (no deaths,     (hottest,  (EN + FR,       (safety,   (pending)      approves    │
  Atom,     items)      heat 0–100)  crime, private  2 per      resolver,       dates,                              │
  trends)                            lives)          category)  or declines)    dedup)                              ▼
                                                                                                    official source ─▶ resolved
                                                                                                    (two matching reads) (public log)
```

| Step | File | What it does |
|---|---|---|
| Ingest | `sources/registry.ts`, `sources/feed.ts` | CBC, Radio-Canada, Global, StatCan *The Daily* (EN/FR), Bank of Canada, ECCC, Google Trends Canada. Every item is Zod-validated; bad items are dropped, a failed feed never fails the cycle. |
| Cluster | `stories.ts` | Groups signals about the same thing across outlets **and languages** (an FR→EN alias table joins "La Banque du Canada baisse son taux" with "Bank of Canada cuts rate"). |
| Heat | `stories.ts` `heatOf` | 0–100 from weighted volume, distinct outlets, EN+FR coverage and an official source, halving every 18 hours. |
| Story screen | `safety/safety.ts` `screenStory` | Before any model call: blocks deaths, violence, crime and private lives. Saves cost and keeps those stories away from the model entirely. |
| Pick | `pipeline.ts` `pickStories` | Hottest undrafted stories over the heat floor, at most 2 per category and 6 per cycle (configurable), so cost is capped. |
| Draft | `draft/claude.ts`, `draft/prompt.ts` | Claude Opus 5.5, adaptive thinking, structured JSON output, cached system prompt, server-side refusal fallback. Writes the question, the rule, the close and result dates and a typed resolver, or declines. Most stories should be declined. |
| Checks | `safety/safety.ts` `screenDraft`, `validate.ts`, `dedup.ts` | Gambling and trading words (EN+FR), tips, persuasion, fake urgency, harm; sports only as unscored polls; elections held for review; official-domain sources only; closes ≥ 24 h out and before the result; "?" with Quebec typography; EN and FR carry the same numbers; duplicates by wording or by the data point they settle on. |
| Review | `review.ts` | `pending → approved → published`, or `rejected` / `needsChanges`. Blocked drafts are `autoRejected` and kept for the audit. Editors must acknowledge each review flag by name; an edit re-runs every check. Every step is logged with who and why. |
| Resolve | `resolve/resolvers.ts`, `resolve/policy.ts` | Bank of Canada Valet (V39079), StatCan WDS vectors, ECCC daily climate. Resolves automatically only on **two matching reads 10+ minutes apart**; a value exactly on the threshold, a disagreement, three errors in a row or a manual question go to an editor. Emits `{ outcome, publishedAt, disputed }` for FORGE's public resolution log. |

`POST /api/engine/cycle` runs a cycle (bearer `ENGINE_CRON_SECRET`; 404 until set). With no keys it runs on `sources/sample-feeds.ts` and the mock drafter, which is what CI and previews use.

## Guardrails, and where each is enforced

| Rule | Enforced in |
|---|---|
| No gambling language (CLAUDE.md 1) | `safety/lexicon.json` (`gambling`, `trading`), told to the model, re-checked on every string |
| Every question EN + FR | `draftSchema` requires both; `validate.ts` checks FR typography and number parity |
| AI explains, never tips (rule 4) | `lexicon.json` `tip`; prompt rule 3 |
| No deaths, violence, private lives, unlawful activity (LEX) | `screenStory` before drafting, `screenDraft` after |
| Sports only as polls, no sportsbook links | `screenDraft` blocks scored sports and flags every sports poll |
| Elections off at launch, never persuasive | `elections` is a review flag; `persuasion` blocks |
| No gambling sources or links (rule 8) | Not in the registry; resolution sources must be on `resolutionDomains` |
| Data stays in Canada (rule 7) | The engine only reads public feeds and sends no user data anywhere. The Claude API receives public headlines only. |
| No unreviewed AI text (M4) | Only `publishApproved` publishes, and only `approved` items |
| Nothing deleted (rule 6) | The store interface has no delete; rejected drafts and every read are kept |

The banned-word lists live **only** in `safety/lexicon.json`. `tests/unit/vocabulary.test.ts` bans those words from `.ts` source, so the prompt reads them from the JSON. When a bad draft gets through, add a pattern there and the draft to `tests/fixtures/engine/banned-wording.json`.

## What I need from zack

| Key | What for | Where it goes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Turns on the Claude drafter (otherwise the mock runs). From console.anthropic.com, in a workspace with a monthly spend limit. | Host env vars (Vercel / server), never in the repo |
| `ENGINE_CRON_SECRET` | 32+ random characters. Turns on the cycle endpoint; the scheduler sends it. | Host env vars and the scheduler |
| Supabase (ca-central-1) | So the queue and resolution records persist (today each run is a dry run in memory). | Same project FORGE needs for M2 |
| `ENGINE_LIVE_FEEDS=1` | Switch from sample feeds to live feeds, once the above exist. | Host env vars |

No key is needed for Google Trends, StatCan, the Bank of Canada or ECCC: they are public.

**Cost.** A draft is about 2–3k input tokens (the system prompt is cached) and 1–2k output, so roughly 4–6 US cents on Opus 5.5. The cycle caps drafts at 6 per run and never redrafts a story, so a normal day is a few dozen drafts, about $1–3. `ENGINE_MAX_DRAFTS` lowers the cap.

## Proposed tables (for FORGE's M2 schema)

All in Supabase ca-central-1, RLS on every table, readable only by the `editor` role except the public log. No table touches points or users.

```sql
create table engine_signals (
  id text primary key, source_id text not null, kind text not null, lang text not null check (lang in ('en','fr')),
  title text not null, summary text not null default '', url text not null, published_at timestamptz not null,
  weight real not null, fetched_at timestamptz not null default now()
);
create table engine_story_runs (          -- one row per story the engine handled, so it never pays to draft twice
  story_id text primary key, outcome text not null, decided_at timestamptz not null
);
create table engine_queue (
  id text primary key, story_id text not null, slug text not null, draft jsonb not null, flags jsonb not null,
  provenance text[] not null, priority smallint not null, drafter text not null,
  status text not null check (status in ('pending','approved','rejected','needsChanges','published','autoRejected')),
  created_at timestamptz not null
);
create table engine_review_events (       -- append-only audit trail
  id bigint generated always as identity primary key, item_id text not null references engine_queue(id),
  at timestamptz not null, actor text not null, from_status text, to_status text not null, note text
);
create table engine_resolution_reads (    -- every read of an official source; feeds the public resolution log
  id bigint generated always as identity primary key, slug text not null, at timestamptz not null, read jsonb not null
);
create table engine_resolutions (
  slug text primary key, state text not null, outcome text check (outcome in ('yes','no')),
  resolved_at timestamptz, resolved_by text, disputed boolean not null default false
);
```

## Next PRs

1. **Editor queue screen** (`/[locale]/editor`, EN/FR, behind editor auth from M2): the queue sorted by priority, flags with plain-English detail, side-by-side EN/FR, approve / request changes / reject, and the resolution queue for anything escalated.
2. **Supabase store** implementing `EngineStore`, plus the scheduler (Supabase cron or Vercel cron, every 15 minutes).
3. **Live calendar sync** from the Bank of Canada schedule and StatCan's release calendar, replacing the sample dates in `sources/calendar.ts`.
4. **"Why it moved" drafts** on the same rails: swing detection, a Claude draft that describes and cites, editor approval (CLAUDE.md rule 4).
