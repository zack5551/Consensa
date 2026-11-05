# Consensa: rules for anyone building here

Consensa is a free, no-stakes Canadian prediction and polling app. People make probability calls ("62% chance") on Canadian questions and see where Canada lands, split by province. It has no money anywhere. The quality bar is a $10M-budget app: the code is advanced (typed, tested, fast, accessible) and the design is articulate (one design system, intentional type and spacing, and every screen says one thing).

## Hard rules (never break these)

1. **No betting language, anywhere:** UI, code names, comments, commits, test data. Banned: bet, wager, odds, parlay, slip, payout, stake, jackpot, pick (as a noun for a forecast), lock (as "lock in"), buy/sell (for a forecast), price, cents (¢), P&L, profit. Use: call, forecast, probability, "62% chance", crowd, "Canada says", "Make your call", "Called it!". `tests/unit/vocabulary.test.ts` enforces this on every dictionary string.
2. **Everything is EN and FR.** No user-facing string is hard-coded in a component. Every string lives in `src/i18n/dictionaries/{en,fr}.ts`, and both files must have the same keys (enforced by a test). French is Quebec French, written for real readers. See the `consensa-voice` skill.
3. **Play money, no value.** Points and scores can never be bought, sold, cashed out, transferred or redeemed. Never write copy implying they might be later. Every surface carries "Free · No money · No prizes · 18+" (see Legal guardrails below).
4. **AI explains, never tips.** "Why it moved" copy describes what changed and cites sources. It never says what to call.
5. **Branch-only.** Never commit to `main`. Work on a branch and open a PR. CI must be green before merge.
6. **Nothing deleted without asking.** Don't delete files, data, branches or migrations unless zack asked for that specific deletion.
7. **Data stays in Canada.** Supabase and self-hosted PostHog run in ca-central-1 (Montreal). Never add a tracker, font CDN or analytics script that sends user data elsewhere without a privacy review.
8. **No gambling advertisers or links.** No sportsbook, casino, lottery, prediction-market or crypto-trading ads, affiliates or links.

## Legal guardrails (LEX)

Full checklist: `docs/legal/consensa-build-guardrails.md`. Read it before touching points, ads, prizes, signup, data exports or partners. **The one rule:** we copy Polymarket and Kalshi's product and UX, never their money mechanics. Nothing a user has, earns or does may ever be worth money.

- No purchase, top-up, cash-out, redemption, transfer or gifting of points or scores. Block it at the database level, and build no API that moves points between users. A premium tier sells features only (stats, history, no ads).
- Every question screen shows the no-value label from the dictionary (`legal.noValue`): "Free to play. No cash value. No purchase necessary." / « Gratuit. Aucune valeur monétaire. Aucun achat requis. » If points are ever added, switch to LEX's exact wording: "Play points. No cash value. No purchase necessary."
- Leaderboards rank accuracy (Brier or log score), never points "won".
- Ads: block gambling, betting, prediction-market and crypto-trading categories at the ad network. An ad never gates a forecast. No public "real money" or "coming soon" copy.
- Questions: nothing on unlawful activity, private lives, deaths or tragedies. Sports only with probability framing and no sportsbook links. Elections are allowed as forecasts and polls, but they're off at launch as a product choice, and never persuasive.
- Prizes are off at launch and behind a feature flag that defaults to off. Turning one on needs legal sign-off.
- Signup: an 18+ gate and three separate, unticked consents: terms, aggregated-data licensing, and marketing email (CASL). Privacy policy linked. EN/FR parity for terms, privacy and support.
- Data exports are aggregates only, with a minimum cell size. Never export at user level.
- **Stop and ask LEX** before merging anything that adds payments, moves value between users, adds prizes, adds gambling or crypto ads, uses odds or payout language, exports user-level data, or involves a gaming partner.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`). pnpm.
- Tailwind CSS 4, with design tokens in `src/styles/tokens.css`. Components use tokens only: no raw hex colours or one-off pixel values in components.
- Zod validates every external input (route params, API bodies, data from the source feeds).
- Vitest for unit tests (`tests/unit`). Playwright + axe for end-to-end and accessibility (`tests/e2e`).
- Coming next: Supabase (Postgres, ca-central-1), realtime, self-hosted PostHog, Sentry with personal info scrubbed.

## Layout

- `src/app/[locale]/…`: routes. `locale` is `en` or `fr`, and `/` redirects to one of them based on the browser's language.
- `src/i18n/`: locale config, dictionaries and `getDictionary()`.
- `src/lib/`: pure logic (scoring, formatting, data types). Keep it framework-free and unit-tested.
- `src/content/`: sample questions until the database lands. Each question has EN and FR text, an official resolution source and a close date.
- `src/components/`: UI. A component gets its strings as props or from the dictionary, never inline.

## Design system (from PRISM)

- Colours: ink `#14213D`, paper `#FAF8F5`, teal `#0F766E` (yes), violet `#6D4AA8` (no), Canada red `#C8102E` (accent only: logo dot, live badges, the "Canada says" label), slate `#5B6472`. Never party colours or sportsbook neon green.
- Type: Manrope (words, ExtraBold for the lowercase "consensa" wordmark) and IBM Plex Mono (numbers, tabular figures). Six sizes on the scale, no others.
- Spacing: a 4px base grid using only the steps in `tokens.css`.
- Every screen states its one message and one action in a comment at the top of the page file before it's built.

## Definition of done for any screen

- [ ] EN and FR complete, and the FR layout checked (French runs about 20% longer).
- [ ] Empty, loading, error and closed or resolved states designed.
- [ ] Keyboard and screen-reader usable, with a text summary for every chart. `pnpm test:e2e` axe check passes.
- [ ] Phone (390px) and desktop look right in light and dark mode.
- [ ] `pnpm check` and `pnpm build` pass.

## Commands

```
pnpm dev          # local dev server
pnpm check        # typecheck + lint + unit tests
pnpm build        # production build
pnpm test:e2e     # Playwright (builds and serves the app)
```

## When something goes wrong

Add a rule to this file so it doesn't happen twice.
