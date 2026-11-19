import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sampleQuestions } from "@/content/sample-questions";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { scan } from "@/engine/safety/safety";
import { calledItFooter, cardSafe, crowdForCard } from "@/lib/share";
import { shareCardColors, shareCardTokens } from "@/lib/share-card-colors";
import { isAllowedPostUrl, questionShareUrl, shareLinks, socialPollLine, socialPollSchema } from "@/lib/social";

/** The gambling, trading and tip rules from the engine's lexicon (CLAUDE.md rule 1), the one home of those words. */
const lexiconRules = new Set(["gambling", "trading", "tip"]);
/**
 * LEX: no giveaway or reward wording on anything people share. "No prizes" is the one allowed mention, and in French it
 * is always « prix à gagner », in exactly these phrases. They are taken out before the check, so any other « gagn… »
 * still fails.
 */
const allowedPhrases = ["Aucun point, aucun prix à gagner", "Pas d’argent, aucun prix à gagner", "aucun achat ni aucun prix à gagner", "Aucun prix à gagner", "Sans prix à gagner", "sans prix à gagner"];
const hits = (line: string) => giveaway.filter((re) => re.test(withoutAllowed(line)));
const withoutAllowed = (line: string) => allowedPhrases.reduce((rest, phrase) => rest.replaceAll(phrase, ""), line);
const giveaway = [/\bgiveaway/i, /\bwin(s|ner|ners|ning)?\b/i, /\breward/i, /\bcontest/i, /\bgagn/i, /\bconcours\b/i, /\btirage/i, /\br[ée]compense/i];

const good = { platform: "x", yes: 719, no: 521, closedAt: "2026-11-05T18:00:00Z", url: "https://x.com/Cansensa/status/1" } as const;

describe("share text", () => {
  const question = "Will the Bank of Canada cut its policy rate at its December decision?";
  for (const [locale, t] of [["en", en], ["fr", fr]] as const) {
    it(`has no banned words and no giveaway wording (${locale})`, () => {
      const lines = [t.share.text.replace("{question}", question), ...Object.values(t.share), t.social.label, t.social.line, t.social.title];
      for (const line of lines) {
        expect(scan(line, lexiconRules), line).toEqual([]);
        expect(giveaway.filter((re) => re.test(withoutAllowed(line))), line).toEqual([]);
      }
    });
  }

  it("allows only the exact « prix à gagner » phrases, nothing else with « gagn… »", () => {
    expect(hits("Gratuit. Aucun prix à gagner.")).toEqual([]);
    expect(hits("Seule la précision compte. Aucun point, aucun prix à gagner.")).toEqual([]);
    expect(hits("Gratuit · Sans argent · Sans prix à gagner · 18 ans et plus")).toEqual([]);
    expect(hits("Aucun point à gagner.").length).toBeGreaterThan(0);
    expect(hits("Gratuit. Rien à gagner.").length).toBeGreaterThan(0);
    expect(hits("Aucun prix à gagner, mais gagnez en précision.").length).toBeGreaterThan(0);
    expect(hits("AUCUN PRIX À GAGNER").length).toBeGreaterThan(0);
  });

  it("never says a bare « aucun prix » or « sans prix » anywhere in French", () => {
    const all = (o: unknown): string[] => (typeof o === "string" ? [o] : typeof o === "object" && o !== null ? Object.values(o).flatMap(all) : []);
    const lines = all(fr).filter((line) => /\b(aucun|sans) prix\b/i.test(line));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.replace(/\b(aucun|sans) prix à gagner\b/gi, ""), line).not.toMatch(/\b(aucun|sans) prix\b/i);
    for (const line of lines) expect(hits(line), line).toEqual([]);
  });

  it("says the post line in both languages, with the free label", () => {
    expect(en.share.text).toBe("{question} Make your call on Cansensa. Free. No prizes.");
    expect(fr.share.text).toBe("{question} Faites votre prévision sur Cansensa. Gratuit. Aucun prix à gagner.");
  });

  it("builds plain intent links that carry only the question URL", () => {
    const url = questionShareUrl("https://cansensa.ca/", "en", "boc-cut-dec-2026");
    expect(url).toBe("https://cansensa.ca/en/q/boc-cut-dec-2026");
    const links = shareLinks(`${question} Make your call on Cansensa. Free. No prizes.`, url);
    expect(new URL(links.x).host).toBe("twitter.com");
    expect(new URL(links.x).searchParams.get("url")).toBe(url);
    expect(new URL(links.facebook).host).toBe("www.facebook.com");
    expect(new URL(links.facebook).searchParams.get("u")).toBe(url);
    expect(new URL(links.threads).host).toBe("www.threads.net");
    expect(new URL(links.threads).searchParams.get("text")).toContain(url);
    for (const link of Object.values(links)) expect([...new URL(link).searchParams.keys()].every((k) => ["text", "url", "u"].includes(k))).toBe(true);
    expect(decodeURIComponent(url)).not.toMatch(/[?&=]/);
  });
});

describe("socialPolls schema", () => {
  it("accepts a good poll, with or without www.", () => {
    expect(socialPollSchema.safeParse(good).success).toBe(true);
    expect(socialPollSchema.safeParse({ ...good, platform: "facebook", url: "https://www.facebook.com/cansensa/posts/1" }).success).toBe(true);
  });

  it.each([
    ["a bad host", { url: "https://evil.example/status/1" }],
    ["a lookalike host", { url: "https://x.com.evil.example/status/1" }],
    ["a platform that does not match the host", { platform: "threads" }],
    ["plain http", { url: "http://x.com/Cansensa/status/1" }],
    ["a negative count", { no: -1 }],
    ["a fractional count", { yes: 10.5 }],
    ["zero votes", { yes: 0, no: 0 }],
    ["a date that is not ISO", { closedAt: "Nov 5" }],
  ])("rejects %s", (_, patch) => {
    expect(socialPollSchema.safeParse({ ...good, ...patch }).success).toBe(false);
  });

  it("allows only the four platforms' hosts", () => {
    expect(["https://threads.net/a", "https://www.threads.com/@cansensa/post/1", "https://www.instagram.com/p/1", "https://x.com/a"].every(isAllowedPostUrl)).toBe(true);
    expect(["https://twitter.com/a", "https://youtube.com/a", "not a url"].some(isAllowedPostUrl)).toBe(false);
  });

  it("names the platform and close date, with localized numbers", () => {
    expect(socialPollLine(good, en.social, "en")).toBe("X poll, Nov 5: 58% yes · 1,240 votes");
    expect(socialPollLine(good, fr.social, "fr")).toBe("Sondage X, 5 nov.\u00A0: 58\u00A0% de oui · 1\u00A0240\u00A0votes");
  });

  it("the sample question carries a valid, marked sample poll", () => {
    const withPolls = sampleQuestions.filter((q) => (q.socialPolls ?? []).length > 0);
    expect(withPolls.length).toBe(1);
    expect(withPolls[0]!.socialPolls!.every((p) => p.sample === true)).toBe(true);
  });
});

describe("share card", () => {
  it("shows the crowd number only when it is real and has 5 or more calls", () => {
    expect(crowdForCard({ forecasters: 4, hiddenProvinces: [] }, 62)).toBeNull();
    expect(crowdForCard({ forecasters: 5, hiddenProvinces: [] }, 62)).toBe(62);
  });

  it("never puts a sample number on a card", () => {
    expect(crowdForCard({ forecasters: 1240 }, 62)).toBeNull();
    for (const q of sampleQuestions) expect(crowdForCard(q, 50)).toBeNull();
  });

  it("keeps every sample question and card label whole, and drops what the brand fonts cannot draw", () => {
    const labels = [en, fr].flatMap((t) => [t.share.calledItFooter, t.share.calledItSports, t.legal.sportsFooter, t.question.makeYourCall, t.question.canadaSays, t.question.canadaSaid, t.question.yes, t.question.no, t.share.cardCalls, t.share.cardCloses, t.share.cardClosed, t.share.cardCancelled]);
    for (const text of [...sampleQuestions.flatMap((q) => [q.question.en, q.question.fr]), ...labels]) expect(cardSafe(text)).toBe(text);
    expect(cardSafe("38\u202F% \u{1F3D2} 日本")).toBe("38\u00A0%  ");
  });

  it("uses the same footer as the Called it! card, plus the fan-forecast line on sports cards", () => {
    for (const [locale, t] of [["en", en], ["fr", fr]] as const) {
      expect(calledItFooter(t, "economy"), locale).toEqual({ footer: t.share.calledItFooter, sports: [] });
      expect(calledItFooter(t, "sports"), locale).toEqual({ footer: t.share.calledItFooter, sports: [t.share.calledItSports, t.legal.sportsFooter] });
    }
    expect(en.share.calledItFooter).toBe("Free. No prizes. No cash value.");
    expect(fr.share.calledItFooter).toBe("Gratuit. Aucun prix à gagner. Aucune valeur monétaire.");
    expect(en.share.calledItSports).toBe("Fan forecasts only.");
    expect(fr.share.calledItSports).toBe("Prévisions de partisans seulement.");
    const card = readFileSync(join(__dirname, "..", "..", "src", "components", "share-card-image.tsx"), "utf8");
    expect(card).toMatch(/const legal = calledItFooter\(t, q\.category\)/);
    expect(card).toMatch(/<CardFrame footer=\{cardSafe\(legal\.footer\)\} sportsFooter=\{legal\.sports\.map\(cardSafe\)\}>/);
  });

  it("uses colours that still match PRISM's light tokens", () => {
    const css = readFileSync(join(__dirname, "..", "..", "brand", "tokens", "tokens.css"), "utf8");
    const light = css.split(':root[data-theme="dark"]')[0]!;
    for (const [key, token] of Object.entries(shareCardTokens)) {
      const m = light.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`));
      expect(m?.[1]?.toLowerCase(), token).toBe(shareCardColors[key as keyof typeof shareCardColors].toLowerCase());
    }
  });
});
