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
  await expect(page.getByText(/questions shown/)).toBeVisible();
});

test("your calls is empty until you make one, then lists it", async ({ page }) => {
  await page.goto("/en/board?show=mine");
  await expect(page.getByText("You haven’t made a call yet")).toBeVisible();
  await page.goto("/en/q/boc-cut-dec-2026");
  await page.getByRole("button", { name: /Toss-up/ }).click();
  await page.getByRole("button", { name: "Make my call" }).click();
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
