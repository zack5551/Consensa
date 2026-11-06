/**
 * Safety screens. Two passes:
 *
 * 1. `screenStory` runs before any model call, on the raw headlines. Stories about deaths, violence, crime or
 *    someone's private life never reach the drafter, which also saves the API cost.
 * 2. `screenDraft` runs on every user-facing string the drafter wrote (EN and FR). It catches gambling language,
 *    tips, persuasion and anything the first pass missed, and adds structural rules (sports are polls only).
 *
 * The word lists live in `lexicon.json`. A `block` flag means the draft is auto-rejected and never shown to anyone;
 * a `review` flag means an editor must clear it. The model is also told these rules, but the screen never trusts it.
 */
import lexicon from "@/engine/safety/lexicon.json";
import type { Draft, Flag, Severity, Story } from "@/engine/types";

interface Rule {
  code: string;
  severity: Severity;
  detail: string;
  patterns: RegExp[];
}

const rules: Rule[] = Object.entries(lexicon)
  .filter(([, value]) => typeof value === "object" && value !== null && "patterns" in value)
  .map(([code, value]) => {
    const v = value as { severity: Severity; detail: string; patterns: string[] };
    return { code, severity: v.severity, detail: v.detail, patterns: v.patterns.map((p) => new RegExp(p, "i")) };
  });

/** Rules that stop a story before drafting. Wording rules don't apply here: a news story may say anything. */
const STORY_RULES = new Set(["harm", "crime", "private"]);

export const ruleCodes: readonly string[] = rules.map((r) => r.code);

/** Accent-stripped, lowercased, typographic apostrophes folded. Keeps punctuation so "!!" and "¢" still match. */
export function foldForMatch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’‘]/g, "'").toLowerCase();
}

/** Every rule a piece of text trips, with the first matching phrase quoted for the editor. */
export function scan(text: string, only?: ReadonlySet<string>): Flag[] {
  const folded = foldForMatch(text);
  const flags: Flag[] = [];
  for (const rule of rules) {
    if (only && !only.has(rule.code)) continue;
    for (const re of rule.patterns) {
      const m = re.exec(folded);
      if (m) {
        flags.push({ code: rule.code, severity: rule.severity, detail: `${rule.detail} Matched “${m[0].trim()}”.` });
        break;
      }
    }
  }
  return flags;
}

export function screenStory(story: Story): Flag[] {
  const text = story.signals.map((s) => `${s.title}\n${s.summary}`).join("\n");
  return dedupeFlags(scan(text, STORY_RULES));
}

/** All the text a forecaster could read for this draft, in both languages. */
export function draftText(draft: Draft): string[] {
  return [
    draft.question.en,
    draft.question.fr,
    draft.resolution.rule.en,
    draft.resolution.rule.fr,
    draft.resolution.source.name.en,
    draft.resolution.source.name.fr,
  ];
}

export function screenDraft(draft: Draft): Flag[] {
  const flags = draftText(draft).flatMap((t) => scan(t));

  if (draft.category === "sports" && draft.scored) {
    flags.push({ code: "sportsScored", severity: "block", detail: "Sports are polls only at launch (scored: false), with no sportsbook links." });
  }
  if (draft.category === "sports") {
    flags.push({ code: "sports", severity: "review", detail: "Sports poll: an editor checks it reads as a fan poll, not a sportsbook line." });
  }
  return dedupeFlags(flags);
}

export function isBlocked(flags: readonly Flag[]): boolean {
  return flags.some((f) => f.severity === "block");
}

function dedupeFlags(flags: Flag[]): Flag[] {
  const seen = new Set<string>();
  return flags.filter((f) => (seen.has(f.code) ? false : (seen.add(f.code), true)));
}
