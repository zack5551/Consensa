import { describe, expect, it } from "vitest";
import { findDuplicate, resolverKey, similarity } from "@/engine/dedup";
import { liveQuestionsFrom, sampleQuestions } from "@/content/sample-questions";
import { sameSubject } from "@/lib/same-subject";
import { goodDraft } from "./helpers";

const live = sampleQuestions.map((q) => ({ slug: q.slug, question: q.question }));

describe("dedup", () => {
  it("catches a reworded question already on the site", () => {
    const draft = goodDraft({
      slug: "boc-cut-december-2026",
      question: { en: "Will the Bank of Canada cut its policy rate in December?", fr: "La Banque du Canada baissera-t-elle son taux directeur en décembre?" },
      resolver: { kind: "boc-policy-rate", decisionDate: "2026-12-09", direction: "cut" },
    });
    expect(findDuplicate(draft, live)?.of).toBe("boc-cut-dec-2026");
  });

  it("treats two questions on the same data point as one, whatever the wording", () => {
    const a = { slug: "a", question: { en: "Unemployment at 7%?", fr: "Chômage à 7 %?" }, resolver: goodDraft().resolver };
    const b = goodDraft({ slug: "b", question: { en: "Will joblessness top seven percent?", fr: "Le chômage dépassera-t-il sept pour cent?" } });
    expect(findDuplicate(b, [a])).toEqual({ of: "a", reason: "settles on the same data" });
  });

  it("leaves genuinely different questions alone", () => {
    expect(findDuplicate(goodDraft(), live)).toBeNull();
    expect(similarity({ slug: "x", question: { en: "Will Toronto get 25 cm of snow in December?", fr: "Neige à Toronto?" } }, { slug: "y", question: { en: "Will Ottawa top 30°C in July?", fr: "Chaleur à Ottawa?" } })).toBeLessThan(0.3);
  });

  it("keys resolvers by what they read", () => {
    expect(resolverKey({ kind: "boc-policy-rate", decisionDate: "2026-12-09", direction: "cut" })).toBe(resolverKey({ kind: "boc-policy-rate", decisionDate: "2026-12-09", direction: "hold" }));
    expect(resolverKey({ kind: "manual", check: "x" })).toBeNull();
  });
});

describe("same subject (zack, 2026-11-26: some questions were put in twice)", () => {
  it("catches the twins that reached the board", () => {
    // Montréal snow, three ways: different amounts, windows and data, one question to a reader.
    expect(sameSubject("Will Montréal-Trudeau airport record 15 cm of snow or more from Dec. 1 to Dec. 15, 2026?", "Will Montréal get 45 cm of snow or more in December?")).toBe(true);
    expect(sameSubject("Will Montréal get 10 cm of snow or more by Dec. 9?", "Will Montréal get 45 cm of snow or more in December?")).toBe(true);
    // Carly Rae Jepsen on two different charts in the same month.
    expect(
      sameSubject(
        "Will a Carly Rae Jepsen song rank in the top 100 of Spotify's weekly Canada chart for the week ending Dec. 3, 2026?",
        "Will Carly Rae Jepsen’s “Run Away With Me” make the Billboard Canadian Hot 100 in December?",
      ),
    ).toBe(true);
  });

  it("keeps questions that only look alike", () => {
    // Different cities' cold snaps.
    expect(sameSubject("Will Winnipeg hit −30 °C before the end of 2026?", "Will Ottawa airport record a low of −25 °C or colder on any day in December 2026?")).toBe(false);
    expect(sameSubject("Will Montréal-Trudeau airport record a low of −15 °C or colder between Nov. 27 and Dec. 13, 2026?", "Will Ottawa airport record a low of −25 °C or colder in December 2026?")).toBe(false);
    // Same city, different weather; same city and weather, different months.
    expect(sameSubject("Will Montréal get 45 cm of snow or more in December?", "Will Montréal record a low of −25 °C or colder in December?")).toBe(false);
    expect(sameSubject("Will Montréal get 45 cm of snow or more in December?", "Will Montréal get 30 cm of snow or more in January?")).toBe(false);
    // Two Bank of Canada decisions.
    expect(sameSubject("Will the Bank of Canada cut its policy rate on Dec. 9?", "Will the Bank of Canada hold its policy rate on Jan. 27?")).toBe(false);
  });

  it("stops a twin draft before review, even when its wording and data differ", () => {
    const draft = goodDraft({
      slug: "montreal-snow-15cm-dec1-15-2026",
      question: { en: "Will Montréal-Trudeau airport record 15 cm of snow or more from Dec. 1 to Dec. 15, 2026?", fr: "L’aéroport Montréal-Trudeau recevra-t-il 15 cm de neige ou plus du 1er au 15 décembre 2026?" },
    });
    expect(findDuplicate(draft, live)).toEqual({ of: "montreal-snow-dec-2026", reason: "same subject and month" });
  });

  it("keeps an engine twin of a built-in question off the board", () => {
    const builtIn = sampleQuestions.find((q) => q.slug === "montreal-snow-dec-2026")!;
    const twin = { ...builtIn, slug: "montreal-snow-15cm-dec1-15-2026", question: { en: "Will Montréal-Trudeau airport record 15 cm of snow or more from Dec. 1 to Dec. 15, 2026?", fr: "Neige à Montréal?" } };
    const other = { ...builtIn, slug: "winnipeg-snow-dec-2026", question: { en: "Will Winnipeg get 30 cm of snow or more in December?", fr: "Neige à Winnipeg?" } };
    const taken = new Set(sampleQuestions.map((q) => q.slug));
    expect(liveQuestionsFrom([twin, other], taken, sampleQuestions).map((q) => q.slug)).toEqual(["winnipeg-snow-dec-2026"]);
    // Two engine twins of each other: the newest (first) one stays.
    expect(liveQuestionsFrom([other, { ...other, slug: "winnipeg-snow-dec-2026-b" }], taken, []).map((q) => q.slug)).toEqual(["winnipeg-snow-dec-2026"]);
  });

  it("leaves no twins among the questions on the site", () => {
    const all = sampleQuestions;
    const twins = all.flatMap((a, i) => all.slice(i + 1).filter((b) => sameSubject(a.question.en, b.question.en)).map((b) => `${a.slug} / ${b.slug}`));
    expect(twins).toEqual([]);
  });
});

