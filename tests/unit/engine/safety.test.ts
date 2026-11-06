import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import lexicon from "@/engine/safety/lexicon.json";
import { isBlocked, scan, screenDraft, screenStory } from "@/engine/safety/safety";
import { sampleQuestions } from "@/content/sample-questions";
import { goodDraft, signal, story } from "./helpers";

const bad = JSON.parse(readFileSync("tests/fixtures/engine/banned-wording.json", "utf8")) as { en: string[]; fr: string[] };

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

  it("only allows sports as unscored polls, and always sends them to an editor", () => {
    expect(isBlocked(screenDraft(goodDraft({ category: "sports", scored: true })))).toBe(true);
    const poll = screenDraft(goodDraft({ category: "sports", scored: false }));
    expect(isBlocked(poll)).toBe(false);
    expect(poll.map((f) => f.code)).toContain("sports");
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
