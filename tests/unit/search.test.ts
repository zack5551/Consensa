import { describe, expect, it } from "vitest";
import { highlight, normalize, search, tokenize, type SearchDocument } from "@/lib/search";

const docs: SearchDocument<string>[] = [
  { item: "boc", fields: [{ text: "Will the Bank of Canada cut its policy rate?", weight: 3 }, { text: "La Banque du Canada baissera-t-elle son taux directeur?", weight: 3 }] },
  { item: "snow", fields: [{ text: "Will Toronto Pearson get 10 cm of snow?", weight: 3 }, { text: "L’aéroport Pearson recevra-t-il 10 cm de neige?", weight: 3 }] },
  { item: "junos", fields: [{ text: "Will a French-language album win at the Junos?", weight: 3 }, { text: "Québec", weight: 1 }] },
];

describe("normalize and tokenize", () => {
  it("strips accents, case and typographic apostrophes", () => {
    expect(normalize("L’Aéroport  QUÉBEC!")).toBe("l aeroport quebec");
  });
  it("drops single letters left over from French elisions", () => {
    expect(tokenize("l’aéroport d’Ottawa")).toEqual(["aeroport", "ottawa"]);
  });
});

describe("search", () => {
  it("returns nothing for an empty or one-letter query", () => {
    expect(search(docs, "")).toEqual([]);
    expect(search(docs, " l ")).toEqual([]);
  });
  it("finds French text from an unaccented query", () => {
    expect(search(docs, "aeroport").map((h) => h.item)).toEqual(["snow"]);
    expect(search(docs, "quebec").map((h) => h.item)).toEqual(["junos"]);
  });
  it("matches word prefixes", () => {
    expect(search(docs, "banq").map((h) => h.item)).toEqual(["boc"]);
  });
  it("requires every word to match", () => {
    expect(search(docs, "snow banque")).toEqual([]);
  });
  it("ranks exact words above prefixes and heavy fields above light ones", () => {
    const ranked: SearchDocument<string>[] = [
      { item: "light", fields: [{ text: "rates", weight: 1 }] },
      { item: "prefix", fields: [{ text: "rates", weight: 3 }] },
      { item: "exact", fields: [{ text: "rate", weight: 3 }] },
    ];
    expect(search(ranked, "rate").map((h) => h.item)).toEqual(["exact", "prefix", "light"]);
  });
  it("keeps input order on ties and honours the limit", () => {
    const same = ["a", "b", "c"].map((item) => ({ item, fields: [{ text: "canada", weight: 1 }] }));
    expect(search(same, "canada", 2).map((h) => h.item)).toEqual(["a", "b"]);
  });
});

describe("highlight", () => {
  it("marks matched words and rebuilds the original text exactly", () => {
    const runs = highlight("L’aéroport de Québec", "quebec aero");
    expect(runs.map((r) => r.text).join("")).toBe("L’aéroport de Québec");
    expect(runs.filter((r) => r.match).map((r) => r.text)).toEqual(["aéroport", "Québec"]);
  });
  it("returns one plain run when the query is empty", () => {
    expect(highlight("Bank of Canada", "")).toEqual([{ text: "Bank of Canada", match: false }]);
  });
});
