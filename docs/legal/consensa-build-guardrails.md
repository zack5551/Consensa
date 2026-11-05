# Consensa: legal guardrails for the build

*LEX, 2026-11-05. The engineering and design checklist for the Consensa repo. Background and sources: [lex-7-questions-brief.md](/mnt/project-files/legal/lex-7-questions-brief.md). Not legal advice; a lawyer reviews before launch.*

**The one rule:** Consensa copies Polymarket and Kalshi's *product and UX*, never their *money mechanics*. Nothing a user has, earns, or does may ever be worth money.

## 1. Points ("play currency"): hard rules, enforced in code
- [ ] No purchase flow for points, anywhere: no Stripe, no in-app purchase, no "top up," no crypto wallet.
- [ ] No cash-out, redemption, gift cards, merch, or discounts for points.
- [ ] No transfers, gifts, tips, or trades of points between users. Block these at the database level, with no API that moves points between accounts.
- [ ] Points never expire into value or carry into any future product. Never say they will.
- [ ] Every market screen shows: **"Play points. No cash value. No purchase necessary." / « Points de jeu. Aucune valeur monétaire. Aucun achat requis. »**
- [ ] A premium tier, if built, sells features only (stats, history, no ads). It never sells more points, better odds, extra predictions, or prize eligibility.

## 2. UX copying: OK vs. not OK

| OK to match Polymarket/Kalshi | Do not build |
|---|---|
| Probability charts, price history, order-book-style depth *as a visual of crowd belief* | Anything labelled "odds," "lines," "spread," "payout," "cash out" |
| "Yes/No" positions using play points, market resolution, accuracy scoring | "P&L," "profit," "returns," "invest," "portfolio value" in $ terms |
| Leaderboards ranked on **forecasting accuracy** (Brier or log score) | Leaderboards ranked on points "won" framed like money |
| Market creation, comments, trending markets, notifications | Leverage, margin, shorting framed as finance, deposit or withdraw screens |
| AI that explains *why* a probability moved | AI that gives picks, tips, "best value," or "lock of the day" |

Preferred vocabulary: *forecast, call, probability, consensus, accuracy, resolve*. Avoid: *bet, wager, odds, parlay, stake, jackpot, win money*.

## 3. Ads and partners
- [ ] **No sportsbook, casino, betting, or prediction-market advertisers**, and no affiliate links to them. Enforce this with an ad-network category blocklist (gambling, betting, crypto trading).
- [ ] No athletes or influencers who appeal to minors in any sports-related marketing.
- [ ] Ads never gate a prediction ("watch an ad to forecast" is not allowed).
- [ ] No public copy mentioning "real money," "coming soon," or "early users rewarded."

## 4. Sports and sensitive markets
- [ ] Sports markets are allowed, but they use probability framing only, with no links to sportsbooks and no "beat the book" language (Criminal Code s. 202(1)(f) risk).
- [ ] Skip markets on unlawful activity, on individuals' private lives, and on deaths or tragedies.
- [ ] Elections and politics are allowed as *forecasts and polls* (no money, so no securities issue). Avoid anything that reads as voter persuasion.

## 5. Prizes and contests (off at launch)
- [ ] **No prizes at launch.** Feature-flag the code off.
- [ ] Any future prize needs free entry, a skill-testing question, Competition Act disclosure, Quebec handling, and legal sign-off first. Free chance draws are still illegal (s. 206(1)(a) to (d)).

## 6. Users, privacy, and data (Law 25 standard)
- [ ] **18+ age gate** at signup.
- [ ] Separate express consents: (a) terms, (b) aggregated-data licensing, (c) marketing email (CASL). No pre-checked boxes.
- [ ] Data hosted in Canada: Supabase in ca-central-1, PostHog self-hosted in Canada. No third-party trackers outside Canada without a PIA.
- [ ] Data is sold or exported as **aggregates only** with a minimum cell size, never row-level or "de-identified" user data.
- [ ] Profiling and AI features are disclosed, with a way to turn them off. Privacy policy link appears at signup.
- [ ] Full EN/FR parity for UI, terms, privacy policy, and support (Bill 96).
- [ ] Run the PIA before launch and keep an anonymization register.

## 7. B2B (phase 2)
- [ ] Data and widget deals with media, brands, and research firms: fine, under privacy rules.
- [ ] Anything for sportsbooks, lotteries, or operators (odds inputs, white-label predictor games, real-money engines) needs gaming supplier registration and legal review first. **Ask LEX before any such conversation.**
- [ ] Any real-money product is a separate entity, codebase, and account system. It never shares points or wallets with Consensa.

## Red flags: stop and ask LEX
Any of these drift toward regulated territory:
- A PR that adds payments touching points or predictions
- A feature that lets value move between users
- Prizes
- Gambling or crypto ads
- Odds or payout language
- Data exports at user level
- Any partner in gaming
