import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** One question per state: open, closing soon, closed (waiting for the result), resolved. */
const pages = ["boc-cut-dec-2026", "giller-debut-2026", "jobs-rate-oct-2026", "cpi-sept-2026"] as const;

for (const locale of ["en", "fr"] as const) {
  for (const slug of pages) {
    test(`question ${slug} in ${locale}: no accessibility violations, no sideways scroll`, async ({ page }) => {
      await page.goto(`/${locale}/q/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(tags).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("every question screen shows the no-value label", async ({ page }) => {
  for (const slug of pages) {
    await page.goto(`/en/q/${slug}`);
    await expect(page.getByText("Free to play. No cash value. No purchase necessary.").first()).toBeVisible();
  }
});

test("a question with a big move names the biggest move in the chart summary", async ({ page }) => {
  await page.goto("/en/q/boc-cut-dec-2026");
  await expect(page.getByRole("img", { name: /Biggest move: down 14 points over 5 days/ })).toBeVisible();
});

test("a question with a big move names it in French too", async ({ page }) => {
  await page.goto("/fr/q/boc-cut-dec-2026");
  await expect(page.getByRole("img", { name: /Plus grand mouvement\s*:\s*baisse de 14\s+points sur 5\s+jours/ })).toBeVisible();
});

test("a question with only small moves names no biggest move", async ({ page }) => {
  await page.goto("/en/q/home-prices-nov-2026");
  await expect(page.getByRole("img", { name: /Biggest move/ })).toHaveCount(0);
});

test("an open question says how Canada moved this week", async ({ page }) => {
  await page.goto("/en/q/boc-cut-dec-2026");
  await expect(page.getByText("Down 2 points this week")).toBeVisible();
  await page.goto("/fr/q/home-prices-nov-2026");
  await expect(page.getByText(/En hausse de 1\s+point cette semaine/)).toBeVisible();
});

test("a resolved question shows no weekly move", async ({ page }) => {
  await page.goto("/en/q/cpi-sept-2026");
  await expect(page.getByText(/points? this week/)).toHaveCount(0);
});

test("a closing-soon question says when it closes", async ({ page }) => {
  await page.goto("/en/q/giller-debut-2026");
  await expect(page.getByText(/This question closes November 8, 2026/)).toBeVisible();
});

test("a closed question stops taking calls", async ({ page }) => {
  await page.goto("/en/q/jobs-rate-oct-2026");
  await expect(page.getByRole("heading", { name: "Calls have closed" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Make my call" })).toHaveCount(0);
});

test("a resolved question shows the answer, and Called it! for a right call", async ({ page }) => {
  await page.goto("/en/q/cpi-sept-2026");
  await page.evaluate(() => window.localStorage.setItem("consensa:call:cpi-sept-2026", "80"));
  await page.reload();
  await expect(page.getByText("Answer: Yes").first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Called it!" }).first()).toContainText("You said 80%.");
});

test("a resolved question says Pas cette fois. for a miss, in French", async ({ page }) => {
  await page.goto("/fr/q/cpi-sept-2026");
  await page.evaluate(() => window.localStorage.setItem("consensa:call:cpi-sept-2026", "20"));
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Pas cette fois." }).first()).toBeVisible();
});

test("after a call, your own region's number shows beside Canada's", async ({ page }) => {
  await page.goto("/fr/q/boc-cut-dec-2026");
  await page.evaluate(() => window.localStorage.setItem("consensa:profile", JSON.stringify({ region: "ON" })));
  await page.reload();
  await expect(page.getByText("Votre région · Ontario")).toHaveCount(0);
  await page.getByRole("button", { name: "Confirmer ma prévision" }).click();
  await expect(page.getByText("Votre région · Ontario")).toBeVisible();
});
