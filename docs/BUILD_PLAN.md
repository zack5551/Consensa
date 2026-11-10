# Consensa build plan

Owner: FORGE (product). Status: **M0 foundations and M1 screens shipped.** M2–M6 in progress.

## Where we're going

A full Consensa app, built in Claude Code, live and real. It's a free, no-stakes Canadian prediction and polling app that matches Polymarket and Kalshi but does better, built to a $10M-budget standard, with advanced code and articulate design, bilingual EN/FR, in the teal/violet brand. Free with ads first, B2B second. Every decision should move toward that app existing.

## Sources of truth (read before building)

| What | Where | Owner |
|---|---|---|
| Rules for anyone writing code here | `CLAUDE.md` | FORGE |
| Legal guardrails | `docs/legal/consensa-build-guardrails.md` | LEX |
| Brand: tokens, logo, fonts, base copy | `brand/` (`brand/README.md` first) | PRISM |
| Voice, EN + Quebec FR | `.claude/skills/consensa-voice/SKILL.md` | PRISM |
| Question writing and sources | `.claude/skills/canadian-questions/SKILL.md` | FORGE |
| Question engine (real-time drafts, review queue, auto-resolution) | `docs/engine/README.md`, `src/engine/` | PULSE |
| The 4-screen clickable prototype (v1) | `docs/design/prototype-v1.html` (live: https://claude.ai/artifact/14VJBF6KNs5wCQQ2CGX7Ys) | FORGE |
| Research brief with ad placements | `docs/design/sean-brief-with-ads.html` | FORGE |
| "Better than Polymarket and Kalshi" | https://claude.ai/artifact/QxMMXm6rGJvPnZa9fDXmQc (summary below) | FORGE |
| Live design system page | `/en/design` and `/fr/design` — the component reference now that the product screens are live | FORGE |

## Quality bars

**$10M standard.** Every screen passes all of these before it ships:

- **Speed:** the first screen is ready in under 1 s on a mid-range Android over 4G, with under 150 KB of first-load JS per route. Taps respond in under 100 ms, and live numbers never shift the layout.
- **Charts:** custom-built from the brand tokens, with event markers, readable at 390 px, tuned for dark mode, and with a text summary for screen readers.
- **Every state designed:** empty, loading, error, offline, closing soon, closed, resolved and disputed.
- **French as good as English:** written natively and designed at French length. Copy gets a Quebec copywriter pass before launch.
- **Accessibility:** WCAG 2.2 AA. axe runs on every route in CI, plus a manual keyboard and screen-reader pass.
- **Consistency:** brand tokens only, with shared components. Screenshot tests cover EN/FR × light/dark × phone/desktop.
- **Reliability:** 99.9% uptime, and realtime holds 50,000 people at once (a Bank of Canada decision day).
- **Trust:** a public methodology page, plus a published calibration record for the crowd itself.

**Advanced (the code):** Next.js App Router, strict TypeScript, Zod at every boundary, generated database types, unit tests on scoring and resolution, Playwright end-to-end tests in both languages, performance budgets enforced in CI, and code review on every PR.

**Articulate (the design):** one design system (PRISM's tokens), an intentional type scale and spacing, and each screen states its one message and one action at the top of its page file before it's built.

## Match Polymarket and Kalshi, then beat them

| Match their standard | Our "better" | Milestone |
|---|---|---|
| Clean question cards, live % and a sparkline | "Canada says" plus the province split on every card | M1 |
| A question page with a chart and ranges | Event markers that open "Why it moved" | M1 (UI), M4 (pipeline) |
| A dense, mobile-first board | "Today's five", a 60-second daily habit, plus a Board view for power users | M1 |
| Live updates | Realtime from the Montreal region | M3 |
| Resolution rules | A "How this resolves" card with the official source, auto-resolution and a public log | M1 (card), M3 (engine) |
| Leaderboards | Accuracy, not money: Brier score, calibration, streaks, leagues by province and friends | M3, with leagues in v1.1 |
| Comments | Bilingual and moderated, with an accuracy badge on each | v1.1 |
| News embeds | A widget per question for Canadian media | M5 |
| (they don't have this) | One bilingual crowd, with the language split shown | M1 |
| (they don't have this) | A "Sharpest forecasters" line weighted by skill, not money | v1.1 |
| (they don't have this) | Crowd vs. experts (economists, Environment Canada, polls) | v1.1 |
| (we won't copy) | Prices in cents, buy/sell buttons, order books, P&L, profit rankings | never |

## Screens (from prototype v1)

The prototype's four screens and its EN/FR toggle carry straight into the build. The components already exist on the design-system page.

1. **Today's five:** cards with the crowd bar, the province split on the lead question, forecaster counts, a poll vs. scored label and a streak. *Components: `QuestionCard`, `CrowdBar`, `ProvinceSplit`.*
2. **Make your call:** a probability slider with quick-set buttons, a comparison with "Canada says", and a saved state. *Component: `CallPanel`.*
3. **Why it moved:** the chart with event markers, the AI explainer (written by AI, reviewed by an editor) and source chips. *Component: `ForecastChart`.*
4. **My record:** Brier score vs. the crowd, a calibration chart, a "Called it! / Vu juste!" moment, and leaderboards (province, Canada, friends).
5. **Question page** (from the "better" doc): all of the above on one page, plus the resolution card and the no-value label.

Ad slots follow `docs/design/sean-brief-with-ads.html`: rails on desktop, one native card plus a sticky banner on phones, always labelled, never on a question or its result, and no gambling or crypto advertisers.

## Milestones

| | What ships | Done when |
|---|---|---|
| **M0 Foundations** — done | CLAUDE.md + LEX guardrails, PRISM brand kit wired in, skills, Next.js + strict TS, EN/FR routing and toggle, design-system components and page, unit tests + Playwright/axe, CI | CI green; the design page passes axe in EN and FR |
| **M1 Screens on sample data** — done | Today's five, the question page, make-a-call, why-it-moved, the record screen. All states designed | The definition of done in CLAUDE.md, for every screen |
| **M2 Accounts + data** | Supabase (ca-central-1): schema, row-level security, auth, 18+ gate, three separate consents, stored calls, no-transfer constraints at the DB level | RLS tests pass; the privacy flow is reviewed by LEX |
| **M3 Resolution + scoring + realtime** | Auto-resolution from official sources for about 27 templates, a review queue, Brier/calibration jobs, a live crowd %, the public resolution log | Scoring matches the unit-tested library; load test at 50k concurrent |
| **M4 AI "why it moved"** | Swing detection, an AI draft in EN/FR with sources, an editor approval queue | No unreviewed AI text reaches users; never a tip |
| **M5 Growth + measurement** | Self-hosted PostHog (Montreal), Sentry (personal info scrubbed), the media embed widget, the ad slots with category blocklists | Funnel (open → call → return) visible; ads pass LEX's list |
| **M6 Launch readiness** | Privacy impact assessment, lawyer review, Quebec copywriter pass, methodology page, performance and accessibility audit | All "stop and ask LEX" items cleared |

Already shipped toward M6: the methodology page is live, and sitemap, robots.txt and canonical URLs landed (PR #26).

## Waiting on zack

- **A Supabase project in ca-central-1** for M2.
- **Repo visibility:** the repo is public — Zack's decision (Nov 7). Do not re-ask about making it private.

## Open items between agents

- `legal.noMoney` (PRISM) and LEX's no-value label differ. CLAUDE.md uses LEX's wording on question screens, and PRISM's line can sit in the footer.
- The app's strings live in `src/i18n/dictionaries/*.ts`. Moving to ICU messages that start from `brand/copy/*.json` is deferred — the dictionaries are the single copy source for now.
