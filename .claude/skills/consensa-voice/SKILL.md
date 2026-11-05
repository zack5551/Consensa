---
name: consensa-voice
description: Write or review any Consensa user-facing text in English and Quebec French. Use for every new string, screen, notification, email or error message, and before merging UI changes.
---

# Consensa voice (EN + FR)

Consensa sounds like a smart, friendly Canadian news desk, not a casino. It's calm, clear and a little playful. It always talks about forecasts and probabilities, never about betting.

## Where strings live

- `src/i18n/dictionaries/en.ts` and `fr.ts`. Both files have the same keys, and `tests/unit/dictionaries.test.ts` fails if they drift.
- Write the English and the French in the same change. Never leave a French key as an English copy or a TODO.

## Vocabulary

| Use (EN) | Use (FR, Quebec) | Never |
|---|---|---|
| Make your call | Faites votre prévision | Place a bet, pick, lock in |
| Call saved | Prévision enregistrée | Bet placed, locked |
| 62% chance | 62 % de chances | odds, 62¢, price, 3-to-1 |
| Canada says | Le Canada pense | the market says, the line |
| Called it! | Vu juste! | You won, payout, cash |
| forecasters | prévisionnistes | bettors, traders, players |
| accuracy, Brier score | précision, score de Brier | profit, P&L, winnings, ROI |
| Today's five | Les cinq du jour | slate, card, parlay |
| Why it moved | Pourquoi ça a bougé | tips, picks, sharp money |
| Free · No money · No prizes · 18+ | Gratuit · Sans argent · Sans prix · 18 ans et + | anything implying points have value |

## French rules (Quebec, Office québécois de la langue française usage)

- Put a non-breaking space before `%`, `:`, `?`, `!` and `;`, and inside « guillemets ». In code, use ` ` (or ` ` before `?!;`).
- Write numbers the French way: `18 420` (thin space as the thousands separator) and `3,5 %`. Use `Intl.NumberFormat("fr-CA")` and never hand-format.
- Dates: `9 déc.` / `9 décembre 2026`. Use `Intl.DateTimeFormat("fr-CA")`.
- Use Quebec terms: courriel (not e-mail), clavarder, magasiner; fin de semaine (not week-end); infolettre.
- Address the reader as "vous", never "tu", except in a playful "Vu juste!".
- Write sentence-case headings in both languages.

## Tone checks before you ship a string

1. Could this line appear on a sportsbook? If so, rewrite it.
2. Does it promise anything of value (prizes, cash, "points will count")? If so, delete it.
3. Does the AI explainer tell people what to call? If so, rewrite it to say what changed and why.
4. Is the French as natural as the English? Read it aloud. If it sounds translated, rewrite it.
5. Does each screen still have one main message and one main action?
