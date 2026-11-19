import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sampleQuestions } from "@/content/sample-questions";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { askedByLabel, askedBySchema, excludedSponsorSectors } from "@/lib/asked-by";
import { questionSchema } from "@/lib/question";
import { cardSafe } from "@/lib/share";
import { questionShareText, withAskedBy } from "@/lib/social";

/** Test fixtures only. No shipped question carries an "Asked by" or "Sponsored by" label yet. */
const sponsor = { kind: "sponsor", name: "Maison Test", sector: "retail" } as const;
const guest = { kind: "guest", name: "Alex Tremblay", paidPartnership: false, writtenPermission: true } as const;
const paidGuest = { ...guest, paidPartnership: true } as const;

describe("asked-by labels (LEX, guest and brand questions)", () => {
  it("uses LEX's exact wording in both languages", () => {
    expect(askedByLabel(sponsor, en.question.askedBy)).toBe("Sponsored by Maison Test");
    expect(askedByLabel(sponsor, fr.question.askedBy)).toBe("Commandité par Maison Test");
    expect(askedByLabel(guest, en.question.askedBy)).toBe("Asked by Alex Tremblay");
    expect(askedByLabel(guest, fr.question.askedBy)).toBe("Question de Alex Tremblay");
    expect(askedByLabel(paidGuest, en.question.askedBy)).toBe("Asked by Alex Tremblay · Paid partnership");
    expect(askedByLabel(paidGuest, fr.question.askedBy)).toBe("Question de Alex Tremblay · Partenariat rémunéré");
  });

  it("never uses the display-ad label or vague wording", () => {
    for (const t of [en, fr]) {
      for (const label of Object.values(t.question.askedBy)) expect(label).not.toMatch(/advertisement|publicit|collaboration|present|présent/i);
    }
  });

  it("draws every label whole on the share card", () => {
    for (const t of [en, fr]) for (const a of [sponsor, guest, paidGuest]) expect(cardSafe(askedByLabel(a, t.question.askedBy))).toBe(askedByLabel(a, t.question.askedBy));
  });
});

describe("asked-by schema", () => {
  it("accepts a sponsor, an unpaid guest and a paid guest", () => {
    for (const a of [sponsor, guest, paidGuest]) expect(askedBySchema.safeParse(a).success).toBe(true);
  });

  it.each(excludedSponsorSectors.map((s) => [s]))("refuses a sponsor from an excluded sector: %s", (sector) => {
    expect(askedBySchema.safeParse({ ...sponsor, sector }).success).toBe(false);
  });

  it("covers LEX's gambling, prediction-market and crypto exclusions", () => {
    expect(excludedSponsorSectors).toEqual(expect.arrayContaining(["gambling", "prediction-market", "crypto", "political", "alcohol"]));
  });

  it.each([
    ["a sponsor with no sector", { kind: "sponsor", name: "Maison Test" }],
    ["a sector LEX has not listed", { ...sponsor, sector: "anything" }],
    ["an empty name", { ...sponsor, name: "  " }],
    ["a name the card cannot draw", { ...sponsor, name: "Maison \u{1F3D2}" }],
    ["a name too long for the card", { ...sponsor, name: "M".repeat(41) }],
    ["a guest with no written permission", { ...guest, writtenPermission: false }],
    ["a guest who has not said whether they are paid", { kind: "guest", name: "Alex", writtenPermission: true }],
    ["an unknown kind", { kind: "partner", name: "Maison Test" }],
  ])("refuses %s", (_, value) => {
    expect(askedBySchema.safeParse(value).success).toBe(false);
  });

  it("is an optional question field", () => {
    const base = sampleQuestions[0]!;
    expect(questionSchema.safeParse({ ...base, askedBy: sponsor }).success).toBe(true);
    expect(questionSchema.safeParse({ ...base, askedBy: { ...sponsor, sector: "gambling" } }).success).toBe(false);
    expect(questionSchema.safeParse(base).success).toBe(true);
  });

  it("refuses a sponsor on a political question (LEX: no political sponsors)", () => {
    const base = sampleQuestions[0]!;
    const political = questionSchema.safeParse({ ...base, political: true, askedBy: sponsor });
    expect(political.success).toBe(false);
    expect(political.error?.issues.map((i) => i.path.join("."))).toContain("askedBy");
    expect(questionSchema.safeParse({ ...base, political: false, askedBy: sponsor }).success).toBe(true);
    expect(questionSchema.safeParse({ ...base, political: true, askedBy: guest }).success).toBe(true);
    expect(questionSchema.safeParse({ ...base, political: true }).success).toBe(true);
  });

  it("is on no shipped question", () => {
    expect(sampleQuestions.filter((q) => q.askedBy !== undefined).map((q) => q.slug)).toEqual([]);
  });

  it("goes wherever the question goes: page, embed, both cards, both posts, the resolution log and the record lists", () => {
    const src = (file: string) => readFileSync(file, "utf8");
    const page = src("src/app/[locale]/q/[slug]/page.tsx");
    expect(page).toMatch(/askedByLabel\(q\.askedBy, t\.question\.askedBy\)/);
    expect(page).toMatch(/<AskedByLabel label=\{askedBy\}/);
    expect(page).toMatch(/questionShareText\(t\.share, q\.question\[locale\], \{ sports: q\.category === "sports", askedBy, closed: !isOpen\(state\) \}\)/);
    expect(page).toMatch(/withAskedBy\(fill\(t\.share\.calledItText, \{ question: q\.question\[locale\] \}\), askedBy\)/);
    for (const file of ["src/app/embed/[locale]/[slug]/page.tsx", "src/app/[locale]/q/[slug]/called-it/[side]/page.tsx", "src/app/[locale]/resolutions/page.tsx"]) {
      expect(src(file), file).toMatch(/<AskedByLabel label=\{q\.askedBy && askedByLabel\(q\.askedBy, t\.question\.askedBy\)\}/);
    }
    expect(src("src/components/share-card-image.tsx")).toMatch(/\{askedBy && <div/);
    expect(src("src/app/[locale]/q/[slug]/called-it/[side]/opengraph-image.tsx")).toMatch(/\{askedBy && <div/);
    expect(src("src/app/[locale]/record/page.tsx")).toMatch(/askedBy: q\.askedBy && askedByLabel\(q\.askedBy, t\.question\.askedBy\)/);
    expect(src("src/components/pending-calls.tsx")).toMatch(/<AskedByLabel label=\{i\.askedBy\} \/>/);
    expect(src("src/components/record-view.tsx")).toMatch(/<AskedByLabel label=\{page\?\.askedBy && askedByLabel\(page\.askedBy, t\.question\.askedBy\)\} \/>/);
  });
});

describe("share post text", () => {
  /** X counts any link as 23 characters; the intent link adds it after one space. */
  const xLength = (text: string) => [...text].length + 1 + 23;

  it("adds LEX's fan-forecast line to sports posts only", () => {
    expect(questionShareText(en.share, "Q?", { sports: true })).toBe("Q? Make your call on Cansensa. Free. No prizes. Fan forecasts only.");
    expect(questionShareText(fr.share, "Q?", { sports: true })).toBe("Q? Faites votre prévision sur Cansensa. Gratuit. Aucun prix à gagner. Prévisions de partisans seulement.");
    expect(questionShareText(en.share, "Q?", { sports: false })).toBe("Q? Make your call on Cansensa. Free. No prizes.");
    expect(questionShareText(fr.share, "Q?", { sports: false })).toBe("Q? Faites votre prévision sur Cansensa. Gratuit. Aucun prix à gagner.");
  });

  it("points to where Canada landed once calls close, and keeps the fan-forecast and asked-by lines", () => {
    expect(questionShareText(en.share, "Q?", { sports: false, closed: true })).toBe("Q? See where Canada landed on Cansensa. Free. No prizes.");
    expect(questionShareText(fr.share, "Q?", { sports: false, closed: true })).toBe("Q? Voyez ce que prévoyait le Canada sur Cansensa. Gratuit. Aucun prix à gagner.");
    expect(questionShareText(en.share, "Q?", { sports: true, closed: true })).toBe("Q? See where Canada landed on Cansensa. Free. No prizes. Fan forecasts only.");
    expect(questionShareText(fr.share, "Q?", { sports: true, closed: true })).toBe(
      "Q? Voyez ce que prévoyait le Canada sur Cansensa. Gratuit. Aucun prix à gagner. Prévisions de partisans seulement.",
    );
    expect(questionShareText(en.share, "Q?", { sports: false, closed: true, askedBy: askedByLabel(guest, en.question.askedBy) })).toBe(
      "Asked by Alex Tremblay · Q? See where Canada landed on Cansensa. Free. No prizes.",
    );
    for (const t of [en, fr]) expect(questionShareText(t.share, "Q?", { sports: false, closed: false })).toBe(questionShareText(t.share, "Q?", { sports: false }));
  });

  it("leads the Called it! post with the label too", () => {
    expect(withAskedBy("I called it on Cansensa: Q? Free. No prizes.", askedByLabel(guest, en.question.askedBy))).toBe("Asked by Alex Tremblay · I called it on Cansensa: Q? Free. No prizes.");
    expect(withAskedBy("J’ai vu juste", undefined)).toBe("J’ai vu juste");
  });

  it("leads with the asked-by label when there is one", () => {
    expect(questionShareText(fr.share, "Q?", { sports: false, askedBy: askedByLabel(sponsor, fr.question.askedBy) })).toBe(
      "Commandité par Maison Test · Q? Faites votre prévision sur Cansensa. Gratuit. Aucun prix à gagner.",
    );
  });

  it("keeps every sample question's X post well under 280 characters", () => {
    for (const [locale, t] of [["en", en], ["fr", fr]] as const) {
      for (const q of sampleQuestions) {
        for (const closed of [false, true]) {
          const text = questionShareText(t.share, q.question[locale], { sports: q.category === "sports", closed });
          expect(xLength(text), `${q.slug} (${locale}${closed ? ", closed" : ""})`).toBeLessThanOrEqual(250);
        }
      }
    }
  });

  it("fits 280 even for the longest French sample question worded as sports, or with a sponsor label", () => {
    const longest = [...sampleQuestions].sort((a, b) => b.question.fr.length - a.question.fr.length)[0]!.question.fr;
    expect(xLength(questionShareText(fr.share, longest, { sports: true }))).toBeLessThan(280);
    expect(xLength(questionShareText(fr.share, longest, { sports: true, closed: true }))).toBeLessThan(280);
    expect(xLength(questionShareText(fr.share, longest, { sports: false, askedBy: askedByLabel(sponsor, fr.question.askedBy) }))).toBeLessThan(280);
  });
});
