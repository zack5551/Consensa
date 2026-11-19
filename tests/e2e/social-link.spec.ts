import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Linked social accounts (sprint 11). The screen sits behind the SOCIAL_VOTING server flag, which is off by default:
 * CI runs the "flag off" half. Run with SOCIAL_VOTING=1 to exercise the screen itself; the account routes are
 * answered here, so no Supabase project or X app is needed.
 */
const flagOn = process.env.SOCIAL_VOTING === "1";

async function answer(page: Page, body: unknown, status = 200) {
  await page.route("**/api/account/social", (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }));
}

async function clean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("flag off", () => {
  test.skip(flagOn, "SOCIAL_VOTING is on for this run");

  for (const locale of ["en", "fr"] as const) {
    test(`the linking page is hidden in ${locale} (404)`, async ({ page }) => {
      const res = await page.goto(`/${locale}/account/social`);
      expect(res?.status()).toBe(404);
      // A hidden page claims no title of its own: the 404's title stands.
      await expect(page).toHaveTitle(locale === "en" ? "Page not found · CANsensus" : "Page introuvable · CANsensus");
    });
  }

  test("the routes answer 404 and the legal pages don't mention linked accounts", async ({ page, request }) => {
    expect((await request.get("/api/account/social")).status()).toBe(404);
    expect((await request.post("/api/account/social/start", { data: { platform: "x", consent: true, locale: "en" } })).status()).toBe(404);
    expect((await request.get("/api/account/social/callback?state=aaaaaaaaaaaaaaaaaaaa&code=x", { maxRedirects: 0 })).status()).toBe(404);
    await page.goto("/en/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Linked social accounts")).toHaveCount(0);
    await page.goto("/en/terms");
    await expect(page.getByText("Linked social accounts")).toHaveCount(0);
  });
});

test.describe("flag on", () => {
  test.skip(!flagOn, "SOCIAL_VOTING is off (the default)");

  for (const locale of ["en", "fr"] as const) {
    test(`not linked, in ${locale}: an unticked consent box, then the link button; no accessibility violations`, async ({ page }) => {
      await answer(page, { signedIn: true, confirmed: true, available: ["x"], links: [] });
      await page.goto(`/${locale}/account/social`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "Count your replies" : "Faites compter vos réponses");
      const box = page.getByRole("checkbox");
      await expect(box).not.toBeChecked();
      await expect(page.getByText(locale === "en" ? "This check is for X only" : "Cette vérification vaut pour X seulement")).toBeVisible();
      await clean(page);

      // Without the box ticked, nothing is sent and the page says why.
      let started = 0;
      await page.route("**/api/account/social/start", (route) => {
        started += 1;
        return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "outside canada" }) });
      });
      const link = page.getByRole("button", { name: locale === "en" ? "Link my X account" : "Lier mon compte X" });
      await link.click();
      await expect(page.getByRole("alert").filter({ hasText: locale === "en" ? "Tick the box to link your account." : "Cochez la case pour lier votre compte." })).toBeVisible();
      expect(started).toBe(0);
      await clean(page);

      await box.check();
      await link.click();
      await expect(page.getByRole("alert").filter({ hasText: locale === "en" ? "connection in Canada" : "connexion au Canada" })).toBeVisible();
      expect(started).toBe(1);
      await clean(page);
    });

    test(`linked, in ${locale}: status, date and a one-click unlink; no accessibility violations`, async ({ page }) => {
      let linked = true;
      await page.route("**/api/account/social", (route) => {
        if (route.request().method() === "DELETE") linked = false;
        const body = route.request().method() === "DELETE" ? { ok: true } : { signedIn: true, confirmed: true, available: ["x"], links: linked ? [{ platform: "x", linkedAt: "2026-11-19T12:00:00Z", paused: false }] : [] };
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      });
      await page.goto(`/${locale}/account/social?result=linked`);
      await expect(page.getByRole("status").filter({ hasText: locale === "en" ? "Your X account is linked" : "Votre compte X est lié" })).toBeVisible();
      await expect(page.getByText(locale === "en" ? "Linked since November 19, 2026" : "Lié depuis le 19 novembre 2026")).toBeVisible();
      await clean(page);
      await page.getByRole("button", { name: locale === "en" ? "Unlink" : "Dissocier" }).click();
      await expect(page.getByRole("status").filter({ hasText: locale === "en" ? "Unlinked." : "Compte dissocié." })).toBeVisible();
      await expect(page.getByRole("checkbox")).not.toBeChecked();
      await clean(page);
    });
  }

  test("signed out, paused and unavailable states read clearly", async ({ page }) => {
    await answer(page, { signedIn: false });
    await page.goto("/en/account/social");
    await expect(page.getByText("Sign in to link a social account.")).toBeVisible();
    await clean(page);

    await answer(page, { signedIn: true, confirmed: true, available: ["x"], links: [{ platform: "x", linkedAt: "2026-10-01T12:00:00Z", paused: true }] });
    await page.goto("/fr/account/social");
    await expect(page.getByText("En pause")).toBeVisible();
    await clean(page);

    await answer(page, { error: "unavailable" }, 503);
    await page.goto("/en/account/social?result=notARealCode");
    await expect(page.getByText("Linking isn’t available right now.")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0); // an unknown result code shows nothing
  });

  test("the legal pages carry LEX’s linked-account rows", async ({ page }) => {
    await page.goto("/en/privacy");
    await expect(page.getByRole("heading", { name: "Linked social accounts (only if you link one)" })).toBeVisible();
    await expect(page.getByText("Until you unlink it or delete your account, then deleted at once")).toBeVisible();
    await page.goto("/fr/terms");
    await expect(page.getByText("Vous pouvez dissocier le compte en tout temps.")).toBeVisible();
  });
});
