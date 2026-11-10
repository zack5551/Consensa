import { describe, expect, it } from "vitest";
import { clusterSignals, guessCategory, heatOf, HEAT_HALF_LIFE_H } from "@/engine/stories";
import { normalize, numbersIn, slugify, tokens } from "@/engine/text";
import { NOW, signal } from "./helpers";

describe("text", () => {
  it("normalizes accents, case and punctuation", () => {
    expect(normalize("Québec : la BdC baisse son taux à 2,25 %!")).toBe("quebec la bdc baisse son taux a 2 25 %");
  });
  it("drops stopwords in both languages and folds plurals", () => {
    expect(tokens("The rates are rising in the provinces")).toEqual(["rate", "rising", "province"]);
    expect(tokens("Les taux de la Banque du Canada")).toEqual(["taux", "banque", "canada"]);
  });
  it("reads numbers the same way in EN and FR", () => {
    expect(numbersIn("2.25% on Dec. 9, 2026")).toEqual(["2.25", "9", "2026"]);
    expect(numbersIn("2,25 % le 9 décembre 2026")).toEqual(["2.25", "9", "2026"]);
    expect(numbersIn("18 420 personnes")).toEqual(["18420"]);
  });
  it("makes short, clean slugs", () => {
    expect(slugify("Will the Bank of Canada cut its rate in December 2026?")).toBe("bank-canada-cut-rate-december-2026");
  });
});

describe("clusterSignals", () => {
  it("joins the same story across outlets and languages", () => {
    const stories = clusterSignals(
      [
        signal({ title: "Economists split on whether Bank of Canada will cut rate in December", publishedAt: "2026-11-06T09:00:00Z" }),
        signal({ title: "La Banque du Canada pourrait baisser son taux en décembre", lang: "fr", sourceId: "rc-economie", publishedAt: "2026-11-06T10:00:00Z" }),
        signal({ title: "Toronto braces for first big snowfall", publishedAt: "2026-11-06T10:30:00Z" }),
      ],
      NOW,
    );
    expect(stories).toHaveLength(2);
    const rate = stories.find((s) => s.signals.length === 2)!;
    expect(rate.langs).toEqual(["en", "fr"]);
    expect(rate.categoryHint).toBe("economy");
  });

  it("doesn't join unrelated stories that share a city", () => {
    const stories = clusterSignals(
      [signal({ title: "Toronto transit fares rise in January" }), signal({ title: "Toronto film festival names its lineup", publishedAt: "2026-11-06T10:05:00Z" })],
      NOW,
    );
    expect(stories).toHaveLength(2);
  });

  it("keeps stories apart when they are days apart", () => {
    const stories = clusterSignals(
      [signal({ title: "Giller Prize shortlist announced", publishedAt: "2026-11-01T10:00:00Z" }), signal({ title: "Giller Prize shortlist reaction", publishedAt: "2026-11-05T10:00:00Z" })],
      NOW,
    );
    expect(stories).toHaveLength(2);
  });

  it("counts a repeated signal once", () => {
    const s = signal({ title: "Snow in Ottawa" });
    expect(clusterSignals([s, s], NOW)[0]!.signals).toHaveLength(1);
  });
});

describe("heatOf", () => {
  it("rises with more outlets, both languages and an official source", () => {
    const one = heatOf([signal({ title: "a" })], NOW);
    const three = heatOf(
      [
        signal({ title: "a", sourceId: "cbc-canada" }),
        signal({ title: "b", sourceId: "rc-economie", lang: "fr" }),
        signal({ title: "c", sourceId: "statcan-daily-en", kind: "official", weight: 2 }),
      ],
      NOW,
    );
    expect(three).toBeGreaterThan(one * 2);
    expect(three).toBeLessThanOrEqual(100);
  });

  it("halves after the half-life", () => {
    const fresh = heatOf([signal({ title: "a", publishedAt: NOW.toISOString() })], NOW);
    const old = heatOf([signal({ title: "a", publishedAt: new Date(NOW.getTime() - HEAT_HALF_LIFE_H * 3_600_000).toISOString() })], NOW);
    expect(Math.abs(old - fresh / 2)).toBeLessThanOrEqual(1);
  });

  it("is 0 for nothing", () => expect(heatOf([], NOW)).toBe(0));
});

describe("guessCategory", () => {
  it.each([
    ["Bank of Canada holds rate", "economy"],
    ["Le taux de chômage grimpe", "economy"],
    ["Rents fall in Vancouver", "housing"],
    ["Tempête de neige à Montréal", "weather"],
    ["Giller Prize shortlist announced", "culture"],
    ["Canadian astronaut launch date set", "science"],
    ["Oilers win in overtime", "sports"],
  ])("%s → %s", (headline, category) => expect(guessCategory(headline)).toBe(category));
});
