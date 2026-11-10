import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** Every screen VECTOR owns, including the empty states (a too-small region, friends, a brand-new forecaster). */
const routes = [
  "record",
  "leaderboard",
  "leaderboard/ontario",
  "leaderboard/atlantic",
  "leaderboard/friends",
  "provinces",
  "provinces/quebec",
  "forecasters/boreal-bayes",
  "forecasters/new-here",
] as const;

for (const locale of ["en", "fr"] as const) {
  for (const route of routes) {
    test(`${route} in ${locale}: no accessibility violations, no sideways scroll`, async ({ page }) => {
      await page.goto(`/${locale}/${route}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(tags).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("my record leads with skill against Canada, in both languages", async ({ page }) => {
  await page.goto("/en/record");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My record");
  await expect(page.locator("#record-headline")).toHaveText(/more accurate than Canada/);
  await expect(page.getByRole("heading", { name: "Called it!" })).toBeVisible();
  await page.goto("/fr/record");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mon bilan");
  await expect(page.getByRole("heading", { name: "Vu juste!" })).toBeVisible();
});

test("a call made on a question shows up as waiting for results", async ({ page }) => {
  await page.goto("/en/record");
  await expect(page.getByText("No calls waiting.")).toBeVisible();
  await page.goto("/en/q/boc-cut-dec-2026");
  await page.getByRole("button", { name: /Toss-up/ }).click();
  await page.getByRole("button", { name: "Make my call" }).click();
  await page.goto("/en/record");
  const pending = page.locator("section", { has: page.getByRole("heading", { name: "Waiting for results" }) });
  await expect(pending.getByRole("link", { name: /Bank of Canada cut/ })).toBeVisible();
  await expect(pending).toContainText("50%");
});

test("the leaderboard ranks by accuracy and highlights you", async ({ page }) => {
  await page.goto("/en/leaderboard");
  const table = page.getByRole("table", { name: /Canada leaderboard/ });
  await expect(table.getByRole("row").nth(1)).toContainText("1");
  await expect(table.getByRole("row", { name: /Fundy Tides/ })).toContainText("You");
  await page.getByRole("link", { name: "Jump to your row" }).click();
  await expect(page).toHaveURL(/#fundy-tides$/);
  await expect(page.getByRole("link", { name: "Canada", exact: true })).toHaveAttribute("aria-current", "page");
});

test("a region with too few forecasters shows its empty state, not a thin board", async ({ page }) => {
  await page.goto("/en/leaderboard/atlantic");
  await expect(page.getByRole("heading", { name: "Not enough forecasters in Atlantic Canada yet" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("province results hide cells under the minimum size", async ({ page }) => {
  await page.goto("/en/provinces/atlantic");
  const row = page.getByRole("row", { name: /Vancouver get more than 150 mm/ });
  await expect(row).toContainText("Too few to show");
});

test("the language toggle keeps you on the leaderboard", async ({ page }) => {
  await page.goto("/en/leaderboard/quebec");
  await page.getByRole("link", { name: "Français" }).click();
  await expect(page).toHaveURL(/\/fr\/leaderboard\/quebec$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Les prévisionnistes les plus précis");
});
