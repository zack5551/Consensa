/**
 * Safety screens. Two passes:
 *
 * 1. `screenStory` runs before any model call, on the raw headlines. Stories about deaths, violence, crime or
 *    someone's private life never reach the drafter, which also saves the API cost.
 * 2. `screenDraft` runs on every user-facing string the drafter wrote (EN and FR). It catches gambling language,
 *    tips, persuasion and anything the first pass missed, and adds the sports rules (pre-game fan forecasts only, LEX's sports-questions rules).
 *
 * The word lists live in `lexicon.json`. A `block` flag means the draft is auto-rejected and never shown to anyone;
 * a `review` flag means an editor must clear it. The model is also told these rules, but the screen never trusts it.
 */
import lexicon from "@/engine/safety/lexicon.json";
import type { Draft, Flag, Severity, Story } from "@/engine/types";

/** `all` rules run on every draft; `sports` rules only on sports drafts; `explanation` rules only on sports explanations. */
type Scope = "all" | "sports" | "explanation";

interface Rule {
  code: string;
  severity: Severity;
  scope: Scope;
  detail: string;
  patterns: RegExp[];
}

const rules: Rule[] = Object.entries(lexicon)
  .filter(([, value]) => typeof value === "object" && value !== null && "patterns" in value)
  .map(([code, value]) => {
    const v = value as { severity: Severity; scope?: Scope; detail: string; patterns: string[] };
    return { code, severity: v.severity, scope: v.scope ?? "all", detail: v.detail, patterns: v.patterns.map((p) => new RegExp(p, "i")) };
  });

/** Rules that stop a story before drafting. Wording rules don't apply here: a news story may say anything. */
const STORY_RULES = new Set(["harm", "crime", "private"]);
/** The same codes, as the skip list for text that is not a news story. */
export const STORY_ONLY: ReadonlySet<string> = STORY_RULES;

export const ruleCodes: readonly string[] = rules.map((r) => r.code);

/** Accent-stripped, lowercased, typographic apostrophes folded. Keeps punctuation so "!!" and "¢" still match. */
export function foldForMatch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’‘]/g, "'").toLowerCase();
}

/** Every rule a piece of text trips, with the first matching phrase quoted for the editor. */
export function scan(text: string, only?: ReadonlySet<string>, scopes: readonly Scope[] = ["all"], skip?: ReadonlySet<string>): Flag[] {
  const folded = foldForMatch(text);
  const flags: Flag[] = [];
  for (const rule of rules) {
    if (!scopes.includes(rule.scope)) continue;
    if (only && !only.has(rule.code)) continue;
    if (skip?.has(rule.code)) continue;
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

/**
 * The IIHF World Junior Championship, the one junior event LEX allows (2026-11-28, sports-questions-rules.md). Its
 * name is lifted out before the word rules run, so "World Juniors" alone doesn't trip the junior ban, while the CHL or
 * any other junior, youth or school sport still does.
 */
const WORLD_JUNIORS = [
  /\biihf (world )?(u-?20|junior)( hockey)?( championships?)?\b/g,
  /\bworld juniors?( hockey)?( championships?)?\b/g,
  /\bworld junior (ice )?hockey championships?\b/g,
  /\bchampionnats? (du monde|mondial) (de hockey )?juniors?( de hockey)?\b/g,
  /\bmondial juniors?( de hockey)?\b/g,
];

/** True when the text is about the World Juniors. */
export function isWorldJuniors(text: string): boolean {
  const folded = foldForMatch(text);
  return WORLD_JUNIORS.some((re) => new RegExp(re.source).test(folded));
}

function withoutWorldJuniors(text: string): string {
  return WORLD_JUNIORS.reduce((t, re) => t.replace(re, " the tournament "), foldForMatch(text));
}

/** Anything about one player: LEX allows team and tournament questions only (many players are 17 or just 18). */
const WJ_PLAYER =
  /\b(goals?|points?|assists?|scor(e|es|er|ers|ing)|stats?|mvp|all-stars?|awards?|ice time|injur\w*|draft(ed)?|prospects?|captain|goalie|goaltender|player|forward|defenceman|defenseman|buts?|passes|marqueurs?|blessures?|repechage|espoirs?|capitaine|gardien|joueurs?|attaquant|defenseur)\b/;
/** Off-ice matters, including the Hockey Canada cases: never a question. */
const WJ_OFF_ICE =
  /\b(hockey canada|assault|allegations?|trial|lawsuits?|scandals?|conduct|charges?|agression|proces|poursuites?|scandales?|inconduite|accusations?)\b/;
/**
 * Capitalised words a World Juniors question may use. Any other capitalised word after the first could be a player's
 * name, so an editor checks it before it goes live.
 */
const WJ_ALLOWED_WORDS = new Set(
  ("will team canada canadian canada's world junior juniors championship championships hockey iihf u20 gold silver bronze medal " +
    "edmonton red deer alberta rogers place peavey mart centrium usa united states american finland sweden czechia czech " +
    "slovakia switzerland germany latvia norway denmark kazakhstan austria russia group a b eastern et time yes no jan " +
    "january dec december oui non équipe equipe mondial suède suede finlande tchéquie tchequie slovaquie suisse allemagne " +
    "lettonie norvège norvege danemark autriche états-unis etats-unis américains americains canadien canadienne heure de " +
    "l'est l’est championnat coupe médaille medaille or argent finale demi-finale quart résolue resolue resolves official officiel officiels iihf.com").split(" "),
);

function worldJuniorsFlags(draft: Draft): Flag[] {
  const flags: Flag[] = [];
  const texts = [draft.question.en, draft.question.fr, draft.resolution.rule.en, draft.resolution.rule.fr];
  const folded = texts.map(foldForMatch).join("\n");
  const player = WJ_PLAYER.exec(folded);
  if (player) {
    flags.push({ code: "worldJuniorsPlayer", severity: "block", detail: `World Juniors: team and tournament questions only, never about a player (LEX). Matched “${player[0]}”.` });
  }
  const offIce = WJ_OFF_ICE.exec(folded);
  if (offIce) {
    flags.push({ code: "worldJuniorsOffIce", severity: "block", detail: `World Juniors: nothing off the ice (LEX). Matched “${offIce[0]}”.` });
  }
  const names = [draft.question.en, draft.question.fr].flatMap((q) =>
    (q.match(/[\p{Lu}][\p{L}’'.-]*/gu) ?? []).slice(1).filter((w) => !WJ_ALLOWED_WORDS.has(w.toLowerCase().replace(/^[ld][’']/, "").replace(/[’']s$/, "").replace(/[.?!]$/, ""))),
  );
  if (names.length > 0) {
    flags.push({ code: "worldJuniorsName", severity: "review", detail: `World Juniors: never name a player; an editor checks “${names[0]}” isn't one (LEX).` });
  }
  return flags;
}

export function screenDraft(draft: Draft): Flag[] {
  const scopes: Scope[] = draft.category === "sports" ? ["all", "sports"] : ["all"];
  const worldJuniors = draftText(draft).some(isWorldJuniors);
  const flags = draftText(draft).flatMap((t) => scan(worldJuniors ? withoutWorldJuniors(t) : t, undefined, scopes));
  if (worldJuniors) flags.push(...worldJuniorsFlags(draft));

  if (draft.category === "sports") {
    flags.push({ code: "sports", severity: "review", detail: "Sports forecast: an editor checks it reads as fan opinion, not sportsbook information." });
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
