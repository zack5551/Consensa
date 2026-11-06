import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const locale of ["en", "fr"] as const) {
  test(`today's five in ${locale}: five cards, no accessibility violations, no sideways scroll`, async ({ page }) => {
    await page.goto(`/${locale}/today`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "Today's five" : "Les cinq du jour");
    await expect(page.locator("article")).toHaveCount(5);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("the lead card shows the province split", async ({ page }) => {
  await page.goto("/en/today");
  await expect(page.getByText("Canada says yes, by province")).toBeVisible();
});

test("making a call counts toward today's progress and shows on the card", async ({ page }) => {
  await page.goto("/en/today");
  await expect(page.getByText("0 of 5 called today")).toBeVisible();
  await page.getByRole("link", { name: /Bank of Canada/ }).click();
  await page.getByRole("button", { name: /Likely/ }).first().click();
  await page.getByRole("button", { name: "Make my call" }).first().click();
  await page.goto("/en/today");
  await expect(page.getByText("1 of 5 called today")).toBeVisible();
  await expect(page.getByText("Your call: 75%")).toBeVisible();
});
