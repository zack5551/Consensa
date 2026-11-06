import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const locale of ["en", "fr"] as const) {
  test(`landing in ${locale}: one h1, the no-value label, no accessibility violations`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "What Canada thinks happens next." : "Ce que le Canada prévoit.");
    await expect(page.getByRole("main")).toContainText(locale === "en" ? "Free to play. No cash value. No purchase necessary." : "Gratuit. Aucune valeur monétaire. Aucun achat requis.");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test("the main action goes to today's five", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("link", { name: "Make today's five calls" }).click();
  await expect(page).toHaveURL(/\/en\/today$/);
});

test("the live question opens its page, and FAQ answers expand", async ({ page }) => {
  await page.goto("/fr");
  await page.getByText("Y a-t-il des prix?").click();
  await expect(page.getByText(/aucune valeur monétaire et ne s’échangent/)).toBeVisible();
  await page.getByRole("heading", { level: 2, name: /Banque du Canada/ }).getByRole("link").click();
  await expect(page).toHaveURL(/\/fr\/q\//);
});

test("How it works in the footer jumps to the section", async ({ page }) => {
  await page.goto("/en/privacy");
  await page.getByRole("contentinfo").getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/\/en#how$/);
  await expect(page.getByRole("heading", { name: "How it works" })).toBeInViewport();
});
