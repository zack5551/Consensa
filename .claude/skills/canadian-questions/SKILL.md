---
name: canadian-questions
description: Draft, check or refresh Consensa questions (the Canadian topics people forecast). Use when adding sample or real questions, writing resolution rules, or planning the weekly question slate.
---

# Canadian questions

A Consensa question is a yes/no (or multi-outcome) forecast about a public, checkable Canadian event, with an official source that settles it. The aim is that a reader in any province finds at least one of "Today's five" worth a call.

## Mix for each weekly slate

- About 70% Canadian and 30% global topics people in Canada care about.
- The core categories: economy (Bank of Canada, StatCan CPI and jobs, CREA housing), weather and climate (Environment Canada), culture (Junos, Giller, box office, TV), civic life that isn't elections (transit openings, infrastructure, public data), and science and tech.
- At least one question a week framed from Quebec or written in French first.
- Sports appear only as **polls, not scored** ("Who are you cheering for?") at launch, with probability framing and no sportsbook links. Elections and politics are allowed by LEX as forecasts and polls, but they stay off at launch (product choice) and must never read as persuasion.

## Every question needs

```ts
{
  slug: "boc-cut-dec-2026",
  category: "economy",
  question: { en: "...", fr: "..." },           // one sentence, ends with "?"
  resolution: {
    source: { name: "Bank of Canada", url: "https://www.bankofcanada.ca/..." },
    rule: { en: "Resolves YES if...", fr: "Résolu OUI si..." }, // exact threshold, units, timezone
    resolvesAt: "2026-12-09T15:00:00Z"          // when the source publishes
  },
  closesAt: "2026-12-09T14:45:00Z",             // before the answer is known
  scored: true
}
```

## Checklist for writing a question

1. **Checkable:** a named official source publishes the answer on a known date. Prefer machine-readable sources (StatCan tables, Bank of Canada Valet API, Environment Canada climate data) so the question can resolve automatically.
2. **Unambiguous:** the threshold, unit, place and timezone are all stated. "10 cm at Toronto Pearson (YYZ) between Nov 1 and Nov 30, 23:59 ET, per Environment Canada daily data."
3. **Not a tip:** never "Should you…" or "Will X be a good buy…".
4. **Not harmful:** no questions about deaths, disasters affecting named people, crimes by private individuals, or minors.
5. **Interesting:** the honest crowd answer should land somewhere between 15% and 85%. Avoid foregone conclusions.
6. **Bilingual:** write the FR version natively (see the `consensa-voice` skill), not as a translation afterthought.
7. **Closes before the answer leaks:** `closesAt` comes before any official release.

## The engine (PULSE) writes most drafts

`src/engine/` turns trending Canadian news into drafts every 15 minutes, and its drafting prompt (`src/engine/draft/prompt.ts`) condenses this skill. When you change the checklist above, change the prompt and the checks to match:

- Wording and harm rules: `src/engine/safety/lexicon.json` (the only place banned words live).
- Dates, official sources, "?" and Quebec typography, EN/FR number parity: `src/engine/validate.ts`. Official resolution domains: `resolutionDomains` in `src/engine/sources/registry.ts`.
- Machine-readable resolvers the engine can settle on its own: `boc-policy-rate` (Bank of Canada Valet V39079), `statcan-vector` (WDS), `eccc-daily-climate` (GeoMet). Anything else is `manual` and an editor settles it.
- A hand-written question goes through the same checks: build it as a `Draft` and run `screenDraft` and `validateDraft` before adding it to `src/content/`.

Every draft waits in the editor queue. Approve only what you'd defend line by line in both languages; acknowledging a flag means you read it. Design doc: `docs/engine/README.md`.

## Where ideas come from (refresh weekly)

- The Bank of Canada schedule, StatCan's release calendar, CREA monthly stats, Environment Canada seasonal outlooks.
- The awards calendar: Junos (spring), Polaris (Sept), Giller (Nov), Canadian Screen Awards.
- What Canadian polls are asking (Angus Reid, Léger, Abacus). Turn a poll topic into a checkable forecast where one exists.
- Big public projects with dated milestones (transit lines, bridges, launches).

The full set of 50 templates is in the FORGE question taxonomy: https://claude.ai/artifact/8g31QYYUVxw1XL4AWBfLt8
