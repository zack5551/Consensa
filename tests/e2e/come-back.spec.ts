import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** Saves calls in this browser before every page load, as if they had been made earlier. */
async function withCalls(page: Page, calls: Record<string, number>) {
  await page.addInitScript((c) => {
    for (const [slug, v] of Object.entries(c)) window.localStorage.setItem(`consensa:call:${slug}`, String(v));
  }, calls);
}

// The e2e build runs on Nov 6, 2026: Montréal's snow (no, Nov 1) and September's inflation (yes, Oct 21) are answered.
const answered = { "mtl-snow-oct-2026": 30, "cpi-sept-2026": 40 };

for (const locale of ["en", "fr"] as const) {
  test(`since your last visit in ${locale}: shows once, then it's gone`, async ({ page }) => {
    await withCalls(page, answered);
    await page.goto(`/${locale}`);
    const panel = page.getByTestId("since-last-visit");
    await expect(panel.getByRole("heading", { level: 2 })).toHaveText(locale === "en" ? "2 of your calls got their answer" : "2 de vos prévisions ont reçu leur réponse");
    await expect(panel.getByText(locale === "en" ? "1 of 2 landed on the right side." : "Du bon côté : 1 sur 2.", { exact: false })).toBeVisible();
    await expect(panel.locator("[data-verdict=calledIt]")).toHaveCount(1);
    await expect(panel.locator("[data-verdict=missed]")).toHaveCount(1);
    await expect(panel.getByRole("link", { name: locale === "en" ? "See my record" : "Voir mon bilan" })).toHaveAttribute("href", `/${locale}/record`);
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(results.violations).toEqual([]);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("since-last-visit")).toHaveCount(0);
  });
}

test("since your last visit: Got it closes it at once", async ({ page }) => {
  await withCalls(page, answered);
  await page.goto("/en");
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.getByTestId("since-last-visit")).toHaveCount(0);
});

test("since your last visit: nothing for someone with no answered calls", async ({ page }) => {
  await withCalls(page, { "boc-cut-dec-2026": 40 });
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("since-last-visit")).toHaveCount(0);
});

for (const locale of ["en", "fr"] as const) {
  test(`monthly recap on My record in ${locale}: last month's calls, accuracy only, shareable`, async ({ page }) => {
    // October: inflation (yes) called at 68%, the October rate hold (no) called at 75%.
    await withCalls(page, { "cpi-sept-2026": 68, "boc-hold-oct-2026": 75 });
    await page.goto(`/${locale}/record`);
    const recap = page.getByTestId("monthly-recap");
    await expect(recap.getByText(locale === "en" ? "Your October" : "Bilan du mois · octobre", { exact: true })).toBeVisible();
    await expect(recap.locator("#monthly-recap")).toContainText(locale === "en" ? "1 of 2" : "1 sur 2");
    await expect(recap.locator("ol [data-verdict]")).toHaveCount(2);
    await expect(recap.getByText(locale === "en" ? "Accuracy only. No points, no prizes." : "Seule la précision compte. Aucun point, aucun prix à gagner.")).toBeVisible();
    const x = recap.getByRole("link", { name: locale === "en" ? /Share on X/ : /Partager sur X/ });
    await expect(x).toHaveAttribute("href", new RegExp(`recap%2F2026-10`));
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("monthly recap: an empty note before any call gets its answer", async ({ page }) => {
  await page.goto("/en/record");
  await expect(page.getByText("Your monthly recap shows here once a call you made gets its answer.")).toBeVisible();
});

for (const locale of ["en", "fr"] as const) {
  test(`month page ${locale}: the same for everyone, with its card`, async ({ page, request }) => {
    const response = await page.goto(`/${locale}/recap/2026-10`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "October 2026 on CANsensus" : "Octobre 2026 sur CANsensus");
    await expect(page.getByRole("main").getByRole("link", { name: locale === "en" ? "Make your call" : "Faire ma prévision" })).toHaveAttribute("href", `/${locale}/board`);
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(results.violations).toEqual([]);
    const card = await request.get(`/${locale}/recap/2026-10/opengraph-image`);
    expect(card.status()).toBe(200);
    expect(card.headers()["content-type"]).toContain("image/png");
  });
}

test("month page: a month that hasn't finished, or never had an answer, is a 404", async ({ page }) => {
  expect((await page.goto("/en/recap/2026-11"))?.status()).toBe(404);
  expect((await page.goto("/en/recap/2025-01"))?.status()).toBe(404);
});
