---
name: consensa-voice
description: Write or review any user-facing Consensa text (UI strings, errors, emails, notifications, marketing, question wording) in English and Quebec French. Use whenever adding or changing copy in en.json/fr.json, components, or emails.
---

# Consensa voice (EN + FR)

The full guide lives in `brand/README.md`, and the base strings are in `brand/copy/en.json` and `brand/copy/fr.json`. These rules are non-negotiable.

## Every string ships in both languages
- Add each key to **both** `en.json` and `fr.json` in the same change, with matching keys and ICU placeholders.
- Write the French natively in Quebec French (OQLF). Don't translate word for word.
- French typography: no space before `?` or `!`; a space before `:` and before `%` (`62 %`); a space as the thousands separator (`12 408`); typographic apostrophe `’`; dates written as `le 5 novembre 2026`.
- Vocabulary: *courriel* (not e-mail), *se connecter*, *prévision*, *bilan*, *série*, *précision*, *Paramètres*.
- Design for French length. If a French string overflows its component, fix the layout, not the French.

## Never betting language (legal position, not style)
Banned in EN: bet, wager, odds, stake, pick (as a noun for a bet), lock, parlay, slip, payout, cash out, jackpot, win money, invest, profit, returns, trade.
Banned in FR: pari, parier, mise, cote, enjeu, gain(s), encaisser, combiné, gros lot, investir, profit, rendement.
Use instead: call / prévision, chance(s) ("62% chance" / "62 % de chances"), Canada says / Le Canada pense, accuracy / précision, streak / série, record / bilan.
Show probabilities as percentages, never as odds (no "3:1", "+150" or decimal odds).
Never imply money, prizes or cash value. Keep `legal.noMoney` visible in the footer or on onboarding.

## Tone
- Like a sharp, friendly Canadian editor: clear, warm, a little wry, never hype.
- Sentences under 20 words. No fake urgency, guilt or dark patterns ("Don't miss out!", "Only 2 hours left!!").
- Exclamation marks only in the signature moment: **"Called it!" / "Vu juste!"**. A miss is "Not this time." / "Pas cette fois.", with no shame.
- Errors say what happened and what to do next, in one or two sentences.

## Question wording
- Make questions neutral, answerable and dated: "Will the Bank of Canada cut its rate at its December 10, 2026 announcement?" / "La Banque du Canada baissera-t-elle son taux lors de son annonce du 10 décembre 2026?"
- State the resolution source and date. Avoid loaded words. Give both sides equal visual weight (teal = side A, violet = side B).
- No scored sports questions in v1.

## Checklist before you finish
1. Both JSON files updated, with key parity.
2. A search for every banned word (EN and FR) comes back with nothing.
3. French typography rules applied.
4. Every string fits the layout at French length.
