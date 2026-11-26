import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.help}`);

for (const locale of ["en", "fr"] as const) {
  for (const path of ["board", "browse", "browse/weather", "search?q=bank"]) {
    test(`/${locale}/${path} has no accessibility violations or sideways scroll`, async ({ page }) => {
      await page.goto(`/${locale}/${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await axe(page)).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("board filters update the list and the URL, and survive a reload", async ({ page }) => {
  await page.goto("/en/board");
  await page.getByRole("button", { name: "Results" }).click();
  await expect(page).toHaveURL(/show=results/);
  await expect(page.getByRole("link", { name: /October 2026 decision/ }).first()).toBeVisible();
  // Housing has no resolved questions, so Results + Housing shows the empty state.
  await page.getByRole("button", { name: "Housing" }).click();
  await expect(page.getByText("Nothing here right now")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Housing" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Show all questions" }).click();
  await expect(page.getByText(/^Showing 20 of \d+ questions$/).first()).toBeVisible();
});

for (const [locale, more, after] of [
  ["en", /^Show \d+ more questions?$/, /^\d+ questions shown$/],
  ["fr", /^Afficher \d+ autres? questions?$/, /^\d+ questions affichées$/],
] as const) {
  test(`/${locale}/board shows 20 questions, then the rest after "show more", with focus on the first new one`, async ({ page }) => {
    await page.goto(`/${locale}/board`);
    const list = page.locator("main").locator("tbody tr:visible, ul > li:visible").filter({ has: page.locator("a[href*='/q/']") });
    await expect(list).toHaveCount(20);
    const button = page.getByRole("button", { name: more });
    await button.click();
    await expect(button).toHaveCount(0);
    expect(await list.count()).toBeGreaterThan(20);
    await expect(page.getByText(after)).toBeVisible();
    await expect(list.nth(20).locator("a[href*='/q/']")).toBeFocused();
    // A new filter starts again at one page.
    await page.getByRole("button", { name: locale === "en" ? "All" : "Toutes", exact: true }).click();
    await expect(list).toHaveCount(20);
    expect(await axe(page)).toEqual([]);
  });
}

test("your calls is empty until you make one, then lists it", async ({ page }) => {
  await page.goto("/en/board?show=mine");
  await expect(page.getByText("You haven’t made a call yet")).toBeVisible();
  await page.goto("/en/q/boc-cut-dec-2026");
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.getByRole("slider").fill("50");
  await page.getByRole("button", { name: "Save my call" }).click();
  await page.goto("/en/board?show=mine");
  await expect(page.getByText("1 question shown")).toBeVisible();
});

test("search finds French text from an English-keyboard query and shares the URL", async ({ page }) => {
  await page.goto("/fr/search");
  await page.getByRole("searchbox", { name: "Rechercher des questions" }).fill("aeroport");
  await expect(page.getByRole("status").filter({ hasText: "correspond" })).toContainText("1 question correspond");
  await expect(page).toHaveURL(/\?q=aeroport/);
  await page.getByRole("link", { name: /Pearson/ }).click();
  await expect(page).toHaveURL(/\/fr\/q\/yyz-snow-nov-2026/);
});

test("search with no match offers browsing by topic", async ({ page }) => {
  await page.goto("/en/search?q=zzzz");
  await expect(page.getByRole("heading", { name: "No questions match “zzzz”" })).toBeVisible();
  await page.getByRole("link", { name: "Browse by topic" }).click();
  await expect(page).toHaveURL(/\/en\/browse$/, { timeout: 15000 });
});

for (const [locale, breaking, trending, coming, gala] of [
  ["en", "Breaking", "Trending", "Coming up", "Test Gala"],
  ["fr", "Dernière heure", "Tendance", "À venir", "Gala d’essai"],
] as const) {
  test(`/${locale}/board tags breaking and trending questions and links an event page`, async ({ page }) => {
    await page.goto(`/${locale}/board`);
    const main = page.getByRole("main");
    await expect(main.getByText(breaking, { exact: true }).locator("visible=true").first()).toBeVisible();
    await expect(main.getByText(trending, { exact: true }).locator("visible=true").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: coming })).toBeVisible();
    await page.getByRole("link", { name: gala }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/event/fixture-gala$`));
    await expect(page.getByRole("heading", { level: 1, name: gala })).toBeVisible();
    await expect(main.locator("a[href*='/q/fixture-']:visible")).toHaveCount(2);
    // The page renders on demand, so its <title> can stream in just after the heading.
    await expect(page).toHaveTitle(new RegExp(gala));
    expect(await axe(page)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("an unknown or finished event has no page", async ({ page }) => {
  const res = await page.goto("/en/event/no-such-event");
  expect(res?.status()).toBe(404);
});

for (const [locale, names, empty] of [
  ["en", { breaking: "Breaking", trending: "Trending", fresh: "New", sports: "Sports" }, "No breaking news right now"],
  ["fr", { breaking: "Dernière heure", trending: "Tendance", fresh: "Nouvelles", sports: "Sports" }, "Aucune nouvelle de dernière heure pour l’instant"],
] as const) {
  test(`/${locale}/board tabs filter to breaking, trending and new questions`, async ({ page }) => {
    await page.goto(`/${locale}/board`);
    const rows = page.getByRole("main").locator("a[href*='/q/']:visible");
    const filters = page.getByRole("group").first();
    await filters.getByRole("button", { name: names.breaking, exact: true }).click();
    await expect(page).toHaveURL(/show=breaking/);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("href", /fixture-breaking$/);
    await filters.getByRole("button", { name: names.trending, exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("href", /fixture-trending$/);
    await filters.getByRole("button", { name: names.fresh, exact: true }).click();
    await expect(rows).toHaveCount(2);
    await filters.getByRole("button", { name: names.breaking, exact: true }).click();
    await page.getByRole("button", { name: names.sports, exact: true }).click();
    await expect(page.getByText(empty)).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });
}
