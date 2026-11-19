import { describe, expect, it, vi } from "vitest";
import { getQuestion, SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { scan } from "@/engine/safety/safety";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { fixtureQuestions } from "@/content/test-fixtures";
import { questionSchema, questionState } from "@/lib/question";
import type { Question } from "@/lib/question";
import { MIN_CELL } from "@/lib/regions";
import { calledItCards, calledItFooter, cardSafe, crowdForCard, hasCalledItCard } from "@/lib/share";
import { calledItShareUrl, shareLinks } from "@/lib/social";

vi.mock("server-only", () => ({}));

/** The gambling, trading and tip rules from the engine's lexicon (CLAUDE.md rule 1), the one home of those words. */
const lexiconRules = new Set(["gambling", "trading", "tip"]);
/** LEX: no giveaway or reward wording on anything people share. "No prizes" / « Aucun prix à gagner » is the one allowed mention. */
const allowedPrizeLine = /Aucun prix à gagner\./g;
const giveaway = [/\bgiveaway/i, /\bwin(s|ner|ners|ning)?\b/i, /\breward/i, /\bcontest/i, /\bgagn/i, /\bconcours\b/i, /\btirage/i, /\br[ée]compense/i];

/** One sample question per case: resolved yes, resolved no, under review, and still open. */
const resolvedYes = "cpi-sept-2026";
const resolvedNo = "mtl-snow-oct-2026";
const disputed = "box-office-oct-2026";
const open = "boc-cut-dec-2026";

const image = async (locale: string, slug: string, side: string) => {
  const { default: Image } = await import("@/app/[locale]/q/[slug]/called-it/[side]/opengraph-image");
  return Image({ params: Promise.resolve({ locale, slug, side }) });
};
const notFound = { digest: expect.stringContaining("404") };

describe("called-it card: when it exists", () => {
  it("the sample questions still cover each case", () => {
    expect(getQuestion(resolvedYes)?.resolution.result).toMatchObject({ outcome: "yes" });
    expect(getQuestion(resolvedNo)?.resolution.result).toMatchObject({ outcome: "no" });
    expect(questionState(getQuestion(disputed)!, SAMPLE_NOW)).toBe("disputed");
    expect(getQuestion(open)?.resolution.result).toBeUndefined();
  });

  it("exists only for a resolved question and the side that happened", () => {
    expect(hasCalledItCard(getQuestion(resolvedYes)!, "yes", SAMPLE_NOW)).toBe(true);
    expect(hasCalledItCard(getQuestion(resolvedYes)!, "no", SAMPLE_NOW)).toBe(false);
    expect(hasCalledItCard(getQuestion(resolvedNo)!, "no", SAMPLE_NOW)).toBe(true);
    expect(hasCalledItCard(getQuestion(resolvedNo)!, "yes", SAMPLE_NOW)).toBe(false);
  });

  it("does not exist while a question is open or its result is under review", () => {
    for (const slug of [open, disputed]) for (const side of ["yes", "no"]) expect(hasCalledItCard(getQuestion(slug)!, side, SAMPLE_NOW), `${slug} ${side}`).toBe(false);
  });

  it("takes yes or no and nothing else", () => {
    for (const side of ["", "YES", "oui", "maybe", "yes/80", "80"]) expect(hasCalledItCard(getQuestion(resolvedYes)!, side, SAMPLE_NOW), side).toBe(false);
  });

  it("lists one card per resolved question, for the side that happened", () => {
    const cards = calledItCards(sampleQuestions, SAMPLE_NOW);
    const resolved = sampleQuestions.filter((q) => questionState(q, SAMPLE_NOW) === "resolved");
    expect(cards).toEqual(resolved.map((q) => ({ slug: q.slug, side: q.resolution.result!.outcome })));
    expect(cards.length).toBeGreaterThanOrEqual(3);
  });
});

describe("called-it image route", () => {
  it("draws a PNG for a resolved question and the right side, in both languages", async () => {
    for (const [locale, slug, side] of [["en", resolvedYes, "yes"], ["fr", resolvedNo, "no"]] as const) {
      const res = await image(locale, slug, side);
      expect(res.headers.get("content-type")).toBe("image/png");
      const body = Buffer.from(await res.arrayBuffer());
      expect(body.subarray(1, 4).toString("latin1")).toBe("PNG");
      expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([1200, 630]);
    }
  });

  it.each([
    ["the wrong side", "en", resolvedYes, "no"],
    ["the wrong side of a no", "fr", resolvedNo, "yes"],
    ["an open question", "en", open, "yes"],
    ["an open question, other side", "en", open, "no"],
    ["a result under review", "en", disputed, "yes"],
    ["a side that is not yes or no", "en", resolvedYes, "80"],
    ["a question that does not exist", "en", "no-such-question", "yes"],
    ["a language we do not have", "de", resolvedYes, "yes"],
  ])("is a 404 for %s", async (_, locale, slug, side) => {
    await expect(image(locale, slug, side)).rejects.toMatchObject(notFound);
  });
});

describe("called-it share text", () => {
  const question = "Will the Bank of Canada cut its policy rate at its December decision?";
  const keys = ["calledItTitle", "calledItText", "calledItLead", "calledItResult", "calledItPageTitle", "calledItFooter", "calledItSports", "calledItCrowd"] as const;

  for (const [locale, t] of [["en", en], ["fr", fr]] as const) {
    it(`has no banned words and no giveaway wording (${locale})`, () => {
      const lines = [...keys.map((k) => t.share[k].replace("{question}", question).replace("{crowd}", "62 %")), t.call.calledIt];
      for (const line of lines) {
        expect(scan(line, lexiconRules), line).toEqual([]);
        expect(giveaway.filter((re) => re.test(line.replace(allowedPrizeLine, ""))), line).toEqual([]);
      }
    });
  }

  it("says the post line in both languages, with the free label", () => {
    expect(en.share.calledItText).toBe("I called it on Cansensa: {question} Free. No prizes.");
    expect(fr.share.calledItText).toBe("J’ai vu juste sur Cansensa : {question} Gratuit. Aucun prix à gagner.");
  });

  it("the card can draw every label with the brand fonts alone", () => {
    for (const t of [en, fr]) for (const text of [t.call.calledIt, t.share.calledItResult, t.resolution.answerIs, t.share.calledItFooter, t.share.calledItSports, t.share.calledItCrowd, t.legal.sportsFooter]) expect(cardSafe(text)).toBe(text);
  });

  it("links to the question and the side only: no user ID, no tracking", () => {
    const url = calledItShareUrl("https://cansensa.ca/", "fr", resolvedYes, "yes");
    expect(url).toBe("https://cansensa.ca/fr/q/cpi-sept-2026/called-it/yes");
    expect(url).not.toMatch(/[?&=#]/);
    const links = shareLinks("text", url);
    expect(new URL(links.x).searchParams.get("url")).toBe(url);
    expect(new URL(links.facebook).searchParams.get("u")).toBe(url);
    for (const link of Object.values(links)) expect([...new URL(link).searchParams.keys()].every((k) => ["text", "url", "u"].includes(k))).toBe(true);
  });
});

/** A resolved yes question to vary, for the cases the samples do not cover. */
const base = (): Question => structuredClone(getQuestion(resolvedYes)!);

describe("called-it card: legal footer (LEX)", () => {
  it("says free, no prizes and no cash value on every card", () => {
    expect(en.share.calledItFooter).toBe("Free. No prizes. No cash value.");
    expect(fr.share.calledItFooter).toBe("Gratuit. Aucun prix à gagner. Aucune valeur monétaire.");
    expect(calledItFooter(en, "economy")).toEqual({ footer: "Free. No prizes. No cash value.", sports: [] });
    expect(calledItFooter(fr, "weather")).toEqual({ footer: "Gratuit. Aucun prix à gagner. Aucune valeur monétaire.", sports: [] });
  });

  it("adds the fan-forecast line, then the non-affiliation line, on sports questions only", () => {
    expect(calledItFooter(en, "sports").sports).toEqual(["Fan forecasts only.", en.legal.sportsFooter]);
    expect(calledItFooter(fr, "sports").sports).toEqual(["Prévisions de partisans seulement.", fr.legal.sportsFooter]);
    for (const category of ["economy", "weather", "housing", "culture", "science"] as const) expect(calledItFooter(en, category).sports, category).toEqual([]);
  });
});

describe("called-it card: the crowd line", () => {
  it("is worded as a chance of yes", () => {
    expect(en.share.calledItCrowd).toBe("Canada gave yes a {crowd} chance.");
    expect(fr.share.calledItCrowd).toBe("Le Canada donnait {crowd} de chances au oui.");
  });

  it("shows only from 5 real calls up, the same floor as every published number", () => {
    expect(MIN_CELL).toBe(5);
    expect(crowdForCard({ forecasters: MIN_CELL - 1, hiddenProvinces: [] }, 62)).toBeNull();
    expect(crowdForCard({ forecasters: 0, hiddenProvinces: [] }, 62)).toBeNull();
    expect(crowdForCard({ forecasters: MIN_CELL, hiddenProvinces: [] }, 62)).toBe(62);
    expect(crowdForCard({ forecasters: 1240, hiddenProvinces: [] }, 62)).toBe(62);
  });
});

describe("called-it card: no card without a right side", () => {
  it("does not exist for an unscored poll, even once it resolves", () => {
    const poll = { ...base(), scored: false };
    for (const side of ["yes", "no"]) expect(hasCalledItCard(poll, side, SAMPLE_NOW), side).toBe(false);
    expect(calledItCards([poll], SAMPLE_NOW)).toEqual([]);
  });

  it("does not exist for a cancelled or voided question, or any outcome other than yes or no", () => {
    for (const outcome of ["cancelled", "canceled", "void", "voided", "annulled", "n/a", ""]) {
      const q = base();
      // Cancelled is a real outcome now; the others are shapes a voided result might take later.
      q.resolution.result = { ...q.resolution.result!, outcome: outcome as "yes" };
      for (const side of ["yes", "no", outcome]) expect(hasCalledItCard(q, side, SAMPLE_NOW), `${outcome} ${side}`).toBe(false);
      expect(calledItCards([q], SAMPLE_NOW), outcome).toEqual([]);
    }
  });

  it("the image route draws no card for a cancelled or unscored question", async () => {
    const live = await import("@/lib/live");
    const cancelled = base();
    cancelled.resolution.result = { ...cancelled.resolution.result!, outcome: "cancelled" as "yes" };
    const unscored = { ...base(), scored: false };
    for (const q of [cancelled, unscored]) {
      const spy = vi.spyOn(live, "withLiveQuestion").mockResolvedValue(q);
      await expect(image("en", resolvedYes, "yes")).rejects.toMatchObject(notFound);
      spy.mockRestore();
    }
  });
});

describe("called-it card: a cancelled game", () => {
  /** The made-up cancelled game from the e2e fixtures (src/content/test-fixtures.ts): settled as cancelled, nobody scored. */
  const cancelledGame = (): Question => questionSchema.parse(fixtureQuestions().find((q) => q.slug === "oilers-canucks-nov-3-2026"));
  const page = async (locale: string, slug: string, side: string) => {
    const { default: Page } = await import("@/app/[locale]/q/[slug]/called-it/[side]/page");
    return Page({ params: Promise.resolve({ locale, slug, side }) });
  };

  it("is cancelled, with a scored flag that does not bring a card back", () => {
    const q = cancelledGame();
    expect(q.scored).toBe(true);
    expect(questionState(q, SAMPLE_NOW)).toBe("cancelled");
  });

  it("has no card on either side", () => {
    const q = cancelledGame();
    for (const side of ["yes", "no", "cancelled"]) expect(hasCalledItCard(q, side, SAMPLE_NOW), side).toBe(false);
    expect(calledItCards([q], SAMPLE_NOW)).toEqual([]);
  });

  it("has no card picture and no page on either side, in either language", async () => {
    const live = await import("@/lib/live");
    const spy = vi.spyOn(live, "withLiveQuestion").mockResolvedValue(cancelledGame());
    try {
      for (const locale of ["en", "fr"]) {
        for (const side of ["yes", "no"]) {
          await expect(image(locale, "oilers-canucks-nov-3-2026", side), `image ${locale} ${side}`).rejects.toMatchObject(notFound);
          await expect(page(locale, "oilers-canucks-nov-3-2026", side), `page ${locale} ${side}`).rejects.toMatchObject(notFound);
        }
      }
    } finally {
      spy.mockRestore();
    }
  });
});
