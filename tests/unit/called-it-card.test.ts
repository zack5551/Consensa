import { describe, expect, it, vi } from "vitest";
import { getQuestion, SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { scan } from "@/engine/safety/safety";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { questionState } from "@/lib/question";
import { calledItCards, cardSafe, hasCalledItCard } from "@/lib/share";
import { calledItShareUrl, shareLinks } from "@/lib/social";

vi.mock("server-only", () => ({}));

/** The gambling, trading and tip rules from the engine's lexicon (CLAUDE.md rule 1), the one home of those words. */
const lexiconRules = new Set(["gambling", "trading", "tip"]);
/** LEX: no giveaway or reward wording on anything people share. "No prizes" / « Aucun prix » is the one allowed mention. */
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
  const keys = ["calledItTitle", "calledItText", "calledItLead", "calledItResult", "calledItPageTitle"] as const;

  for (const [locale, t] of [["en", en], ["fr", fr]] as const) {
    it(`has no banned words and no giveaway wording (${locale})`, () => {
      const lines = [...keys.map((k) => t.share[k].replace("{question}", question)), t.call.calledIt];
      for (const line of lines) {
        expect(scan(line, lexiconRules), line).toEqual([]);
        expect(giveaway.filter((re) => re.test(line)), line).toEqual([]);
      }
    });
  }

  it("says the post line in both languages, with the free label", () => {
    expect(en.share.calledItText).toBe("I called it on Cansensa: {question} Free. No prizes.");
    expect(fr.share.calledItText).toBe("J’ai vu juste sur Cansensa : {question} Gratuit. Aucun prix.");
  });

  it("the card can draw every label with the brand fonts alone", () => {
    for (const t of [en, fr]) for (const text of [t.call.calledIt, t.share.calledItResult, t.resolution.answerIs, t.question.chance]) expect(cardSafe(text)).toBe(text);
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
