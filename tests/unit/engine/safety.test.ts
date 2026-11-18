import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import lexicon from "@/engine/safety/lexicon.json";
import { isBlocked, scan, screenDraft, screenStory } from "@/engine/safety/safety";
import { screenExplanation } from "@/engine/explain";
import { sampleQuestions } from "@/content/sample-questions";
import { goodDraft, signal, story } from "./helpers";

const bad = JSON.parse(readFileSync("tests/fixtures/engine/banned-wording.json", "utf8")) as { en: string[]; fr: string[] };
type Pair = { en: string[]; fr: string[] };
const sports = JSON.parse(readFileSync("tests/fixtures/engine/sports-wording.json", "utf8")) as {
  blocked: Record<string, Pair>;
  clean: Pair;
  explanation: { blocked: Pair; clean: Pair };
};
const CLEAN_EN = "Will the Maple Leafs make the 2027 NHL playoffs?";
const CLEAN_FR = "Les Maple Leafs participeront-ils aux séries éliminatoires de la LNH en 2027?";
const sportsDraft = (question: { en: string; fr: string }) => goodDraft({ category: "sports", scored: true, question });

describe("screenStory (before any model call)", () => {
  it.each([
    "Two killed in highway crash near Kingston",
    "Police charged with assault after Halifax protest",
    "Shooting in downtown Winnipeg leaves one injured",
    "Singer hospitalized after health scare, publicist says",
    "Deux morts dans une fusillade à Montréal",
    "Arrestation d’un suspect à Québec",
    "L’animatrice annonce son divorce",
  ])("blocks: %s", (title) => {
    expect(isBlocked(screenStory(story([signal({ title })])))).toBe(true);
  });

  it.each([
    "Bank of Canada holds rate at 2.25%",
    "Toronto braces for first big snowfall",
    "Giller Prize shortlist announced",
    "Le taux de chômage grimpe au Canada",
    "Tuesday's jobs numbers beat forecasts",
  ])("lets through: %s", (title) => {
    expect(screenStory(story([signal({ title })]))).toEqual([]);
  });

  it("checks summaries too, not just headlines", () => {
    expect(isBlocked(screenStory(story([signal({ title: "Update from Highway 401", summary: "Three people died in the collision." })])))).toBe(true);
  });
});

describe("screenDraft (every user-facing string, EN and FR)", () => {
  it("passes a clean draft", () => {
    expect(screenDraft(goodDraft())).toEqual([]);
  });

  it.each(bad.en.map((q) => [q]))("blocks gambling or tip wording (EN): %s", (q) => {
    expect(isBlocked(screenDraft(goodDraft({ question: { en: q, fr: "Question propre?" } })))).toBe(true);
  });

  it.each(bad.fr.map((q) => [q]))("blocks gambling or tip wording (FR): %s", (q) => {
    expect(isBlocked(screenDraft(goodDraft({ question: { en: "Clean question?", fr: q } })))).toBe(true);
  });

  it("blocks bad wording hidden in the resolution rule", () => {
    const d = goodDraft();
    const flags = screenDraft({ ...d, resolution: { ...d.resolution, rule: { ...d.resolution.rule, fr: "Résolue OUI si la cote dépasse 2. Sinon, NON." } } });
    expect(flags.map((f) => f.code)).toContain("gambling");
  });

  it("lets sports be scored, and always sends them to an editor", () => {
    const flags = screenDraft(goodDraft({ category: "sports", scored: true }));
    expect(isBlocked(flags)).toBe(false);
    expect(flags.find((f) => f.code === "sports")?.severity).toBe("review");
    expect(flags.map((f) => f.code)).not.toContain("sportsScored");
  });

  it("holds election questions for an editor (off at launch)", () => {
    const flags = screenDraft(goodDraft({ question: { en: "Will turnout pass 65% in the next federal election?", fr: "Le taux de participation dépassera-t-il 65 % au prochain scrutin fédéral?" } }));
    expect(flags.find((f) => f.code === "elections")?.severity).toBe("review");
  });

  it("blocks loaded wording and fake urgency", () => {
    expect(isBlocked(screenDraft(goodDraft({ question: { en: "Will the disastrous transit line finally open?", fr: "La ligne ouvrira-t-elle?" } })))).toBe(true);
    expect(isBlocked(screenDraft(goodDraft({ question: { en: "Don't miss out: will it snow?", fr: "Neigera-t-il?" } })))).toBe(true);
  });

  it("lets every existing sample question through, so the rules aren't over-tight", () => {
    for (const q of sampleQuestions) {
      const text = [q.question.en, q.question.fr, q.resolution.rule.en, q.resolution.rule.fr].join("\n");
      expect(scan(text).filter((f) => f.severity === "block"), q.slug).toEqual([]);
    }
  });
});

describe("lexicon", () => {
  it("compiles every pattern", () => {
    for (const [code, rule] of Object.entries(lexicon)) {
      if (typeof rule !== "object" || !("patterns" in rule)) continue;
      for (const p of rule.patterns) expect(() => new RegExp(p, "i"), `${code}: ${p}`).not.toThrow();
    }
  });

  it("catches every word CLAUDE.md bans", () => {
    const claude = readFileSync("CLAUDE.md", "utf8");
    const line = claude.split("\n").find((l) => l.startsWith("1. **No betting language"))!;
    const words = ["bet", "wager", "odds", "parlay", "slip", "payout", "stake", "jackpot", "profit", "lock in"];
    for (const w of words) expect(line.toLowerCase()).toContain(w.split(" ")[0]);
    for (const w of words) expect(scan(`Will the ${w} matter?`).map((f) => f.code), w).toContain("gambling");
  });
});

describe("sports rules (LEX): pre-game fan forecasts only", () => {
  for (const [code, examples] of Object.entries(sports.blocked)) {
    it.each(examples.en.map((q) => [q]))(`${code} blocks (EN): %s`, (q) => {
      const flags = screenDraft(sportsDraft({ en: q, fr: CLEAN_FR }));
      expect(flags.find((f) => f.code === code)?.severity).toBe("block");
      expect(isBlocked(flags)).toBe(true);
    });
    it.each(examples.fr.map((q) => [q]))(`${code} blocks (FR): %s`, (q) => {
      const flags = screenDraft(sportsDraft({ en: CLEAN_EN, fr: q }));
      expect(flags.find((f) => f.code === code)?.severity).toBe("block");
      expect(isBlocked(flags)).toBe(true);
    });
  }

  it("blocks the same wording inside the resolution rule", () => {
    const d = sportsDraft({ en: CLEAN_EN, fr: CLEAN_FR });
    const flags = screenDraft({ ...d, resolution: { ...d.resolution, rule: { ...d.resolution.rule, en: "Resolves YES if the Leafs win in the second period. Otherwise NO." } } });
    expect(flags.map((f) => f.code)).toContain("sportsLive");
  });

  it.each(sports.clean.en.map((q) => [q]))("lets a clean sports question through to an editor (EN): %s", (q) => {
    expect(isBlocked(screenDraft(sportsDraft({ en: q, fr: CLEAN_FR })))).toBe(false);
  });

  it.each(sports.clean.fr.map((q) => [q]))("lets a clean sports question through to an editor (FR): %s", (q) => {
    expect(isBlocked(screenDraft(sportsDraft({ en: CLEAN_EN, fr: q })))).toBe(false);
  });

  it("applies the sports flags to sports drafts only", () => {
    const text = { en: "Will the Leafs win at +150?", fr: CLEAN_FR };
    expect(screenDraft(goodDraft({ category: "economy", question: text })).map((f) => f.code)).not.toContain("sportsOddsFormat");
    expect(screenDraft(sportsDraft(text)).map((f) => f.code)).toContain("sportsOddsFormat");
  });

  it("keeps decimal-looking percentages and season spans out of the odds-format flag", () => {
    const flags = screenDraft(sportsDraft({ en: "Will the Leafs finish the 2026-27 season above 62.50% in points?", fr: "Les Leafs termineront-ils la saison 2026-27 au-dessus de 62,50 %?" }));
    expect(flags.map((f) => f.code)).not.toContain("sportsOddsFormat");
  });

  it("every sports sample question is pre-game and clears every block flag", () => {
    const samples = sampleQuestions.filter((q) => q.category === "sports");
    expect(samples.length).toBeGreaterThanOrEqual(3);
    for (const q of samples) {
      expect(q.scored).toBe(true);
      expect(q.startsAt).toBeDefined();
      expect(Date.parse(q.closesAt)).toBeLessThanOrEqual(Date.parse(q.startsAt!));
      const text = [q.question.en, q.question.fr, q.resolution.rule.en, q.resolution.rule.fr, q.resolution.source.name.en, q.resolution.source.name.fr];
      expect(text.flatMap((t) => scan(t, undefined, ["all", "sports"])).filter((f) => f.severity === "block")).toEqual([]);
    }
  });
});

describe("sports explanations never name a winner or say what to call", () => {
  it.each(sports.explanation.blocked.en.map((t) => [t]))("blocks (EN): %s", (t) => {
    expect(isBlocked(screenExplanation("sports", t))).toBe(true);
  });
  it.each(sports.explanation.blocked.fr.map((t) => [t]))("blocks (FR): %s", (t) => {
    expect(isBlocked(screenExplanation("sports", t))).toBe(true);
  });
  it.each([...sports.explanation.clean.en, ...sports.explanation.clean.fr].map((t) => [t]))("lets a description of what changed through: %s", (t) => {
    expect(screenExplanation("sports", t)).toEqual([]);
  });
  it("applies the sports check to sports only, and the tip check to everything", () => {
    expect(screenExplanation("economy", "The Leafs will win tonight.")).toEqual([]);
    expect(isBlocked(screenExplanation("economy", "Should you buy now?"))).toBe(true);
    expect(isBlocked(screenExplanation("sports", "Should you call yes?"))).toBe(true);
  });
  it("every sample why note, in every category, passes the guard", () => {
    for (const q of sampleQuestions.filter((x) => x.why)) {
      for (const lang of ["en", "fr"] as const) expect(screenExplanation(q.category, q.why!.body[lang]), q.slug).toEqual([]);
    }
  });
});
