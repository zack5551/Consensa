import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The "live" app on port 3101 talks to a mock Supabase (see playwright.config.ts), so the page has live crowd data.
const LIVE = "http://localhost:3101";
const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const NBSP = " ";

test.describe("World/VPN line with live data", () => {
  for (const [locale, shown, dash] of [
    ["en", "World/VPN: 58% · 12 calls", "World/VPN: —"],
    ["fr", `Monde/RPV${NBSP}: 58${NBSP}% · 12 prévisions`, `Monde/RPV${NBSP}: —`],
  ] as const) {
    test(`${locale}: shows the group, a dash under 5 calls, and passes axe`, async ({ page }) => {
      await page.goto(`${LIVE}/${locale}/q/boc-cut-dec-2026`);
      const line = page.getByTestId("world-vpn");
      await expect(line).toBeVisible();
      expect((await line.innerText()).replace(/ /g, NBSP)).toBe(shown);
      const results = await new AxeBuilder({ page }).withTags(tags).analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);

      await page.goto(`${LIVE}/${locale}/q/giller-debut-2026`);
      await expect(page.getByTestId("world-vpn")).toHaveText(dash);
    });
  }
});

test("the World/VPN line is hidden when accounts are off", async ({ page }) => {
  await page.goto("/en/q/boc-cut-dec-2026");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("world-vpn")).toHaveCount(0);
});
