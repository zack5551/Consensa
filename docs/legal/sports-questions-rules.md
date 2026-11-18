# Sports questions: engineering rules

What the code and the question slate follow for sports. The checks live in `src/engine/safety/` and `src/engine/validate.ts`; the build guardrails in `consensa-build-guardrails.md` still apply.

## Allowed
- Season and award outcomes (playoffs, a cup, a trophy), and trades or signings confirmed by an official source.
- Game-winner questions, pre-game only: calls close before the start. Results show after the official final.
- Canadian focus: NHL, CFL, MLS, CPL, Raptors, Blue Jays, PWHL, national teams and the Olympics.

## Not allowed
- In-game or live questions, or anything that changes during play.
- Questions about margins, totals, exact scores, first scorers or a player's stat line in one game.
- Amateur, youth, junior, university or high-school sports.
- Any number format other than percentages.
- Wording that compares with sportsbook lines or tells people what to call.
- Explanations that name who will win or recommend a call.

## Conventions
- Every sports question has `startsAt`, and calls close at the earlier of `closesAt` and `startsAt`.
- Season and championship questions close when the playoffs start. Interest in the playoffs goes in pre-series questions that close before game 1.
- Postponed or cancelled games are voided, never resolved NO.
- Results come from official league sites. No paid data feeds.

## Labels and look
- Every sports question page carries the fan-forecast label next to the no-value label (`legal.sportsLabel`).
- Every sports question page and the sports browse page carry the non-affiliation footer (`legal.sportsFooter`).
- No league or team logos, jerseys or player photos. Text and neutral colours only. Percentages only.

## Data
- Sports probabilities are never sold, licensed or fed to sportsbooks, betting services or tipsters. No public API of live sports numbers.
- Sports accuracy leaderboards use Brier score. No prizes or rewards.
- Sports pages get extra ad-category blocking.
