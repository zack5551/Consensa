import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("root redirects to a locale based on the browser language", async ({ browser }) => {
  const fr = await browser.newContext({ locale: "fr-CA", extraHTTPHeaders: { "accept-language": "fr-CA,fr;q=0.9" } });
  const page = await fr.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/fr$/);
  await fr.close();
});

for (const locale of ["en", "fr"] as const) {
  test(`design system page renders in ${locale} with no accessibility violations`, async ({ page }) => {
    await page.goto(`/${locale}/design`);
    await expect(page.locator("html")).toHaveAttribute("lang", `${locale}-CA`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test(`no horizontal scroll in ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("language toggle keeps you on the same page in the other language", async ({ page }) => {
  await page.goto("/en/design");
  await page.getByRole("link", { name: "Français" }).click();
  await expect(page).toHaveURL(/\/fr\/design$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Système de design");
});

test("making a call saves it and compares with Canada", async ({ page }) => {
  await page.goto("/en/q/boc-cut-dec-2026");
  await page.getByRole("button", { name: /Toss-up/ }).click();
  await page.getByRole("button", { name: "Make my call" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Call saved" })).toContainText("Call saved");
  await expect(page.getByRole("status").filter({ hasText: "Call saved" })).toContainText("12 points more confident than Canada");
});
