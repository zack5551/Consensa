import { describe, expect, it } from "vitest";
import { findDuplicate, resolverKey, similarity } from "@/engine/dedup";
import { sampleQuestions } from "@/content/sample-questions";
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
