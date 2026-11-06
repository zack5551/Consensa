import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

for (const locale of ["en", "fr"] as const) {
  test(`embed widget in ${locale}: no app chrome, no accessibility violations`, async ({ page }) => {
    await page.goto(`/embed/${locale}/boc-cut-dec-2026`);
    await expect(page.locator("html")).toHaveAttribute("lang", `${locale}-CA`);
    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(page.getByRole("link", { name: locale === "en" ? /Make your call on Consensa/ : /Faites votre prévision sur Consensa/ })).toHaveAttribute("href", /utm_source=embed/);
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test("the embed can be framed by publishers; the app can't", async ({ request }) => {
  const embed = await request.get("/embed/en/boc-cut-dec-2026");
  expect(embed.headers()["x-frame-options"]).toBeUndefined();
  expect(embed.headers()["content-security-policy"]).toContain("frame-ancestors *");
  const app = await request.get("/en/today");
  expect(app.headers()["x-frame-options"]).toBe("DENY");
});

test("today's five shows one labelled ad slot; question pages show none", async ({ page }) => {
  await page.goto("/en/today");
  await expect(page.getByRole("complementary", { name: "Advertisement" })).toHaveCount(1);
  await page.goto("/en/q/boc-cut-dec-2026");
  await expect(page.locator("[data-ad-slot]")).toHaveCount(0);
});
