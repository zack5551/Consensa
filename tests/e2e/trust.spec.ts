import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const locale of ["en", "fr"] as const) {
  for (const path of ["methodology", "resolutions"] as const) {
    test(`${path} in ${locale}: no accessibility violations, no sideways scroll`, async ({ page }) => {
      await page.goto(`/${locale}/${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("methodology explains Brier with worked examples", async ({ page }) => {
  await page.goto("/en/methodology");
  const table = page.getByRole("table", { name: "Brier score examples" });
  await expect(table).toContainText("0.040");
  await expect(table).toContainText("0.640");
});

test("French Brier scores use a decimal comma", async ({ page }) => {
  await page.goto("/fr/methodology");
  await expect(page.getByRole("table", { name: "Exemples de scores de Brier" })).toContainText("0,250");
});

test("the resolution log lists results, a pending question and a review", async ({ page }) => {
  await page.goto("/en/resolutions");
  await expect(page.getByRole("listitem").filter({ hasText: "September's inflation" })).toContainText("Yes");
  await expect(page.getByRole("listitem").filter({ hasText: "unemployment rate" })).toContainText("Waiting");
  await expect(page.getByText("Under review: the result isn't scored until the review ends.")).toBeVisible();
});
