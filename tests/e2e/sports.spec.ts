import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const labels = {
  en: { label: "Fan forecasts only. Not advice.", footer: "Not affiliated with or endorsed by any league, team or player." },
  fr: { label: "Prévisions de fans seulement. Pas un conseil.", footer: "Aucun lien avec une ligue, une équipe ou un joueur, qui ne l’approuvent pas." },
} as const;

for (const locale of ["en", "fr"] as const) {
  for (const slug of ["leafs-playoffs-2027", "oilers-flames-dec-2026"]) {
    test(`sports question ${slug} in ${locale} shows both labels, and axe passes`, async ({ page }) => {
      await page.goto(`/${locale}/q/${slug}`);
      await expect(page.getByText(labels[locale].label)).toBeVisible();
      await expect(page.getByText(labels[locale].footer)).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(tags).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }

  test(`the sports browse page in ${locale} shows the footer, and axe passes`, async ({ page }) => {
    await page.goto(`/${locale}/browse/sports`);
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

test("a sports question takes scored calls: the panel shows what the call would score", async ({ page }) => {
  await page.goto("/en/q/leafs-playoffs-2027");
  await expect(page.getByText(/you’d score/).locator("visible=true").first()).toBeVisible();
});
