import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";

/** LEX's sports-questions rules: a fan-forecast label next to the no-value label, and a non-affiliation footer. */
describe("sports labels", () => {
  it("has the fan-forecast label and the non-affiliation footer in both languages", () => {
    expect(en.legal.sportsLabel).toBe("Fan forecasts only. Not advice.");
    expect(en.legal.sportsFooter).toBe("Not affiliated with or endorsed by any league, team or player.");
    expect(fr.legal.sportsLabel).toBe("Prévisions de fans seulement. Pas un conseil.");
    expect(fr.legal.sportsFooter).toBe("Aucun lien avec une ligue, une équipe ou un joueur, qui ne l’approuvent pas.");
  });

  it("shows them on sports screens only", () => {
    const gated = (file: string) => readFileSync(file, "utf8");
    expect(gated("src/app/[locale]/q/[slug]/page.tsx")).toMatch(/q\.category === "sports" && <SportsNotice label=\{t\.legal\.sportsLabel\} footer=\{t\.legal\.sportsFooter\}/);
    expect(gated("src/app/embed/[locale]/[slug]/page.tsx")).toMatch(/q\.category === "sports" && <SportsNotice label=/);
    expect(gated("src/app/[locale]/browse/[category]/page.tsx")).toMatch(/category === "sports" && <SportsNotice footer=\{t\.legal\.sportsFooter\}/);
  });
});
