import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const labels = {
  en: { label: "Fan forecasts only. Not advice.", footer: "Not affiliated with or endorsed by any league, team or player." },
  fr: { label: "Prévisions de partisans seulement. Ce ne sont pas des conseils.", footer: "Cansensa n’est affilié à aucune ligue, équipe ou joueur, et n’est approuvé par aucun d’eux." },
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

test("a sports question shows its close and start times in Eastern time", async ({ page }) => {
  await page.goto("/en/q/leafs-playoffs-2027");
  // The header names the close time; the call panel repeats it under the answers.
  await expect(page.locator("article header").getByText("Closes Apr 15, 7:00 p.m. ET")).toBeVisible();
  await expect(page.getByText("Starts Apr 16, 7:00 p.m. ET")).toBeVisible();
  await page.goto("/fr/q/leafs-playoffs-2027");
  await expect(page.locator("article header").getByText(/Fermeture le 15 avr\.,\s19\sh \(HE\)/)).toBeVisible();
});

test("a sports question takes scored calls: the panel shows what the call would score", async ({ page }) => {
  await page.goto("/en/q/leafs-playoffs-2027");
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(page.getByText(/you’d score/).locator("visible=true").first()).toBeVisible();
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
