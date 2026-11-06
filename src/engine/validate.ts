/**
 * Structural checks on a draft: the parts of the question-writing checklist that code can enforce
 * (`.claude/skills/canadian-questions/SKILL.md`). Safety wording lives in `safety/safety.ts`.
 */
import { isResolutionDomain } from "@/engine/sources/registry";
import { numbersIn } from "@/engine/text";
import type { Draft, Flag } from "@/engine/types";

/** A question can't close sooner than this, so people have time to make a call. */
export const MIN_OPEN_MS = 24 * 60 * 60 * 1000;
/** Nor later than this. Long questions are fine, but the slate is about what's happening now. */
export const MAX_OPEN_MS = 400 * 24 * 60 * 60 * 1000;
/** The result has to land soon after closing, or nobody remembers the question. */
export const MAX_RESOLVE_GAP_MS = 45 * 24 * 60 * 60 * 1000;

export const MAX_QUESTION_CHARS = { en: 120, fr: 150 } as const;

const block = (code: string, detail: string): Flag => ({ code, severity: "block", detail });
const review = (code: string, detail: string): Flag => ({ code, severity: "review", detail });

export function validateDraft(draft: Draft, now: Date): Flag[] {
  const flags: Flag[] = [];
  const closes = Date.parse(draft.closesAt);
  const resolves = Date.parse(draft.resolution.resolvesAt);

  // Dates
  if (closes - now.getTime() < MIN_OPEN_MS) flags.push(block("closesTooSoon", "Closes less than 24 hours from now."));
  if (closes - now.getTime() > MAX_OPEN_MS) flags.push(block("closesTooLate", "Closes more than about 13 months from now."));
  if (closes >= resolves) flags.push(block("closesAfterResult", "Must close before the official source publishes the answer."));
  if (resolves - closes > MAX_RESOLVE_GAP_MS) flags.push(review("longResultGap", "The result comes more than 45 days after closing."));

  // Source: only official or primary sources settle a question
  if (!isResolutionDomain(draft.resolution.source.url)) {
    flags.push(block("sourceNotOfficial", `Resolution source ${draft.resolution.source.url} isn't on the official-source list.`));
  }
  if (!draft.resolution.source.url.startsWith("https://")) flags.push(block("sourceNotHttps", "Resolution source must use https."));

  // Wording, both languages
  for (const lang of ["en", "fr"] as const) {
    const q = draft.question[lang].trim();
    if (!q.endsWith("?")) flags.push(block(`questionMark.${lang}`, `The ${lang.toUpperCase()} question must end with “?”.`));
    if (q.length > MAX_QUESTION_CHARS[lang]) flags.push(review(`long.${lang}`, `The ${lang.toUpperCase()} question is over ${MAX_QUESTION_CHARS[lang]} characters.`));
    if ((q.match(/\?/g) ?? []).length > 1) flags.push(block(`oneQuestion.${lang}`, "One question per question."));
  }
  if (/[\s  ][?!]/.test(draft.question.fr)) {
    flags.push(block("frTypography", "Quebec style: no space before ? or ! in French."));
  }
  if (!/^r[ée]solue? (oui|non)/i.test(draft.resolution.rule.fr.trim())) {
    flags.push(review("frRuleOpening", "French rule should open with « Résolue OUI si… »."));
  }
  if (!/^resolves (yes|no)/i.test(draft.resolution.rule.en.trim())) {
    flags.push(review("enRuleOpening", "English rule should open with “Resolves YES if…”."));
  }

  // EN and FR must say the same thing: same numbers in the question and the rule
  for (const part of ["question", "rule"] as const) {
    const en = part === "question" ? draft.question.en : draft.resolution.rule.en;
    const fr = part === "question" ? draft.question.fr : draft.resolution.rule.fr;
    const a = numbersIn(en).sort().join(",");
    const b = numbersIn(fr).sort().join(",");
    if (a !== b) flags.push(review(`numbersDiffer.${part}`, `EN and FR ${part} carry different numbers (${a || "none"} vs ${b || "none"}).`));
  }

  // Resolver agrees with the dates and the rule
  const r = draft.resolver;
  const resolvesDay = draft.resolution.resolvesAt.slice(0, 10);
  if (r.kind === "boc-policy-rate" && r.decisionDate > resolvesDay) {
    flags.push(block("resolverAfterResult", "The decision date is after resolvesAt."));
  }
  if (r.kind === "eccc-daily-climate") {
    if (r.from > r.to) flags.push(block("resolverRange", "Climate window ends before it starts."));
    if (r.to >= resolvesDay) flags.push(block("resolverAfterResult", "The result must come after the climate window ends."));
  }
  if (r.kind === "statcan-vector" && !numbersIn(draft.resolution.rule.en).includes(String(r.threshold))) {
    flags.push(review("thresholdNotInRule", `The rule text doesn't state the threshold ${r.threshold}.`));
  }
  if (r.kind === "manual") flags.push(review("manualResolver", `Resolves by hand: ${r.check}`));
  if (!draft.scored && draft.category !== "sports") flags.push(review("unscored", "Poll, not scored. Check that's intended."));

  return flags;
}
