import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();

for (const locale of ["en", "fr"] as const) {
  for (const path of ["privacy", "terms"]) {
    test(`${path} summary renders in ${locale} with the shell and no accessibility violations`, async ({ page }) => {
      await page.goto(`/${locale}/${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("contentinfo")).toContainText(locale === "en" ? "Free · No money · No prizes · 18+" : "Gratuit · Sans argent · Sans prix");
      const results = await axe(page);
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }

  test(`unknown paths get a real 404 and the branded page in ${locale}`, async ({ page }) => {
    const response = await page.goto(`/${locale}/this-does-not-exist`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "This page didn’t happen." : "Cette page est introuvable.");
  });
}

test("phones get the bottom tab bar, desktops get the header nav", async ({ page, isMobile }) => {
  await page.goto("/fr/privacy");
  const tabs = page.getByRole("navigation", { name: "Sections" });
  const header = page.getByRole("navigation", { name: "Principal" });
  if (isMobile) {
    await expect(tabs).toBeVisible();
    await expect(header).toBeHidden();
    await expect(tabs.getByRole("link", { name: "Classement" })).toHaveAttribute("href", "/fr/leaderboard");
  } else {
    await expect(header).toBeVisible();
    await expect(tabs).toBeHidden();
  }
});

test("the theme button cycles device → light → dark and remembers it", async ({ page }) => {
  await page.goto("/en/terms");
  const toggle = page.getByRole("button", { name: /^Theme:/ });
  await expect(toggle).toHaveAccessibleName("Theme: Match device");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
