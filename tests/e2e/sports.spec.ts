import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const labels = {
  en: { label: "Fan forecasts only. Not advice.", footer: "Not affiliated with or endorsed by any league, team or player." },
  fr: { label: "Prévisions de partisans seulement. Ce ne sont pas des conseils.", footer: "CANsensus n’est affilié à aucune ligue, équipe ou joueur, et n’est approuvé par aucun d’eux." },
} as const;

for (const locale of ["en", "fr"] as const) {
  for (const slug of ["leafs-playoffs-2027", "canadiens-playoffs-2027", "canadian-team-cup-2027"]) {
    test(`sports question ${slug} in ${locale} shows both labels, and axe passes`, async ({ page }) => {
      await page.goto(`/${locale}/q/${slug}`);
      await expect(page.getByText(labels[locale].label)).toBeVisible();
      await expect(page.getByText(labels[locale].footer)).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(tags).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }

  test(`the sports browse page in ${locale} shows the footer, and axe passes`, async ({ page }) => {
    await page.goto(`/${locale}/browse/sports?show=results`);
    await expect(page.getByText(labels[locale].footer)).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test(`other pages in ${locale} carry neither sports label`, async ({ page }) => {
    for (const path of ["q/boc-cut-dec-2026", "browse/economy"]) {
      await page.goto(`/${locale}/${path}`);
      await expect(page.getByText(labels[locale].label)).toHaveCount(0);
      await expect(page.getByText(labels[locale].footer)).toHaveCount(0);
    }
  });
}

test("a sports question shows its close time in Eastern time, and a season question no start time", async ({ page }) => {
  await page.goto("/en/q/leafs-playoffs-2027");
  // The header names the close time; the call panel repeats it under the answers.
  await expect(page.locator("article header").getByText("Closes Apr 15, 7:00 p.m. ET")).toBeVisible();
  // A start time belongs to a game question only, in its game line: not here, right after the close.
  await expect(page.getByText(/^Starts /)).toHaveCount(0);
  await page.goto("/fr/q/leafs-playoffs-2027");
  await expect(page.locator("article header").getByText(/Fermeture le 15 avr\.,\s19\sh \(HE\)/)).toBeVisible();
});

test("a sports question takes scored calls: the panel shows what the call would score", async ({ page }) => {
  await page.goto("/en/q/leafs-playoffs-2027");
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(page.getByText(/you’d score/).locator("visible=true").first()).toBeVisible();
});

// A game question (test fixture, e2e build only): the matchup and start time in words, calls closing at the start.
const game = {
  en: { line: "NHL · Maple Leafs at Canadiens · Nov 21, 7:00 p.m. ET", closes: "Closes Nov 21, 7:00 p.m. ET", scored: "Counts toward your record" },
  fr: { line: /LNH · Maple Leafs c\. Canadiens · 21 nov\.,\s19\sh \(HE\)/, closes: /Fermeture le 21 nov\.,\s19\sh \(HE\)/, scored: "Comptée dans votre bilan" },
} as const;

// The cancelled test fixture: the game was not played, so there is no answer and nobody is scored.
const cancelled = {
  en: { badge: "Cancelled", note: /The game was not played, so there is no answer and nobody is scored\. Canada gave yes a 57% chance before it was cancelled\./, noAnswer: "No answer: game not played", panel: "The game was not played, so no call on this question is scored.", line: "NHL · Canucks at Oilers · Nov 3, 9:00 p.m. ET", calledIt: "Called it!", missed: "Not this time.", notScored: "Not scored", scored: "Counts toward your record", closedOn: "This question stopped taking calls on November 3, 2026." },
  fr: { badge: "Annulée", note: /Le match n’a pas eu lieu\s: il n’y a donc pas de réponse et personne n’est évalué\. Le Canada donnait 57\s% de chances au oui avant l’annulation\./, noAnswer: /Aucune réponse\s: match non joué/, panel: /Le match n’a pas eu lieu\s: aucune prévision sur cette question n’est évaluée\./, line: /LNH · Canucks c\. Oilers · 3 nov\.,\s21\sh \(HE\)/, calledIt: "Vu juste!", missed: "Pas cette fois.", notScored: "Non évaluée", scored: "Comptée dans votre bilan", closedOn: /le 3 novembre 2026\./ },
} as const;

for (const locale of ["en", "fr"] as const) {
  test(`a game question in ${locale} shows the matchup and start time as text, and axe passes`, async ({ page }) => {
    await page.goto(`/${locale}/q/canadiens-leafs-nov-21-2026`);
    await expect(page.getByTestId("game-line")).toHaveText(game[locale].line);
    // The call panel is in the DOM twice (phone and desktop copies, one hidden), so look for the copy on screen.
    await expect(page.getByText(game[locale].closes).filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator("article header").getByText(game[locale].scored, { exact: true })).toBeVisible();
    await expect(page.locator("article img")).toHaveCount(0);
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test(`the cancelled game in ${locale} says so, scores nobody, and axe passes`, async ({ page }) => {
    const c = cancelled[locale];
    await page.goto(`/${locale}/q/oilers-canucks-nov-3-2026`);
    // A saved call on either side gets no verdict and no score.
    for (const value of ["80", "20"]) {
      await page.evaluate((v) => window.localStorage.setItem("consensa:call:oilers-canucks-nov-3-2026", v), value);
      await page.reload();
      await expect(page.getByText(c.panel).locator("visible=true").first()).toBeVisible();
      await expect(page.getByText(c.calledIt)).toHaveCount(0);
      await expect(page.getByText(c.missed)).toHaveCount(0);
      await expect(page.getByText(/Brier/)).toHaveCount(0);
    }
    await expect(page.getByText(c.badge, { exact: true }).first()).toBeVisible();
    // A cancelled game is not scored, so its header says so instead of the scored badge (LEX).
    await expect(page.locator("article header").getByText(c.notScored, { exact: true })).toBeVisible();
    await expect(page.locator("article header").getByText(c.scored, { exact: true })).toHaveCount(0);
    await expect(page.getByText(c.note)).toBeVisible();
    await expect(page.getByText(c.noAnswer).first()).toBeVisible();
    // No answer pill under the crowd's number: the badge, the score line and the note already say it was cancelled.
    await expect(page.locator("section", { has: page.locator(".text-display-lg") }).getByText(c.noAnswer)).toHaveCount(0);
    await expect(page.getByTestId("game-line")).toHaveText(c.line);
    // The 9 p.m. ET start is 02:00 UTC the next day; the close date is the Eastern one (LEX).
    await expect(page.getByText(c.closedOn).locator("visible=true").first()).toBeVisible();
    await expect(page.getByText(labels[locale].label)).toBeVisible();
    await expect(page.getByText(labels[locale].footer)).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test(`lists in ${locale} show the cancelled state, and its share card renders`, async ({ page, request }) => {
    await page.goto(`/${locale}/resolutions`);
    const row = page.locator("li", { has: page.locator('a[href$="/q/oilers-canucks-nov-3-2026"]') });
    await expect(row.getByText(cancelled[locale].badge, { exact: true }).first()).toBeVisible();
    await expect(row.getByText("—")).toBeVisible();
    await page.goto(`/${locale}/browse/sports?show=results`);
    // The board draws a table on desktop and a list on phones; one of the two is visible.
    const boardRow = page.locator("tr:visible, li:visible").filter({ has: page.locator('a[href$="/q/oilers-canucks-nov-3-2026"]') });
    await expect(boardRow.getByText(cancelled[locale].badge, { exact: true })).toBeVisible();
    const res = await request.get(`/${locale}/q/oilers-canucks-nov-3-2026/opengraph-image`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });
}

test("a game page opened after the start offers no call, even though the page was rendered before it", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-22T00:00:01Z") });
  await page.goto("/en/q/canadiens-leafs-nov-21-2026");
  await expect(page.getByRole("heading", { name: "Calls have closed" }).locator("visible=true").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Yes", exact: true })).toHaveCount(0);
});

test("a sports question's share post says it is fan forecasts only, and other posts do not", async ({ page }) => {
  const post = async () => new URL((await page.locator('a[data-share="x"]').getAttribute("href")) ?? "").searchParams.get("text") ?? "";
  const lines = { en: "Free. No prizes. Fan forecasts only.", fr: "Gratuit. Aucun prix à gagner. Prévisions de partisans seulement." } as const;
  for (const locale of ["en", "fr"] as const) {
    await page.goto(`/${locale}/q/leafs-playoffs-2027`);
    expect(await post()).toContain(lines[locale]);
    await page.goto(`/${locale}/q/boc-cut-dec-2026`);
    expect(await post()).not.toContain(lines[locale]);
  }
});
