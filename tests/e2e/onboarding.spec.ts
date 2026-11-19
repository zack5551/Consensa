import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.help}`);

test("an adult goes through onboarding in French with every consent unticked by default", async ({ page }) => {
  await page.goto("/fr/welcome");
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: "Français" }).click();

  await expect(page.getByRole("heading", { name: "D’abord, quel âge avez-vous?" })).toBeFocused();
  await page.getByLabel("Date de naissance").fill("1990-05-01");
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByRole("heading", { name: "Où habitez-vous?" })).toBeVisible();
  await page.getByLabel("Quebec").or(page.getByLabel("Québec")).first().check();
  await page.getByRole("button", { name: "Continuer" }).click();

  await page.getByText("Météo").click();
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByRole("heading", { name: "Gardez votre bilan" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  for (const box of await page.getByRole("checkbox").all()) await expect(box).not.toBeChecked();

  await page.getByLabel("Courriel", { exact: true }).fill("lea@exemple.ca");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Acceptez les conditions d’utilisation pour continuer.")).toBeVisible();

  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("heading", { name: "C’est parti." })).toBeVisible();
  await expect(page.getByText("Résultats anonymes : non · Statistiques d’usage : non · Courriels : non".replace(/ :/g, " :"))).toBeVisible();

  const stored = await page.evaluate(() => window.localStorage.getItem("consensa:profile"));
  expect(stored).not.toBeNull();
  expect(stored).not.toContain("1990");
});

test("someone under 18 is stopped and stays stopped for the visit", async ({ page }) => {
  await page.goto("/en/welcome");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByLabel("Date of birth").fill("2012-01-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "CANsensus is for people 18 and over" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "CANsensus is for people 18 and over" })).toBeVisible();
});

test("choosing the other language moves onboarding to that language", async ({ page }) => {
  await page.goto("/en/welcome");
  await page.getByRole("main").getByRole("link", { name: "Français" }).click();
  await expect(page).toHaveURL(/\/fr\/welcome\?step=age/);
  await expect(page.getByRole("heading", { name: "D’abord, quel âge avez-vous?" })).toBeVisible();
});

for (const locale of ["en", "fr"] as const) {
  test(`sign in in ${locale}: validates, then confirms without saying whether the account exists`, async ({ page }) => {
    await page.goto(`/${locale}/sign-in`);
    expect(await axe(page)).toEqual([]);
    const email = page.getByLabel(locale === "en" ? "Email" : "Courriel", { exact: true });
    await email.fill("nope");
    await page.getByRole("button", { name: locale === "en" ? "Send me a link" : "M’envoyer un lien" }).click();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await email.fill("sam@example.ca");
    await page.getByRole("button", { name: locale === "en" ? "Send me a link" : "M’envoyer un lien" }).click();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(locale === "en" ? "Check your email" : "Vérifiez vos courriels");
  });
}

test("sign-in and onboarding carry the question page through, and finish there", async ({ page }) => {
  const question = "/en/q/boc-cut-dec-2026";
  await page.goto(`/en/sign-in?next=${question}`);
  await expect(page.getByRole("main").getByRole("link", { name: "Get started" })).toHaveAttribute("href", `/en/welcome?next=${question}`);
  await page.getByRole("main").getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/welcome\\?next=${question}$`));

  // The other language keeps the same question, in that language.
  await expect(page.getByRole("main").getByRole("link", { name: "Français" })).toHaveAttribute("href", "/fr/welcome?step=age&next=/fr/q/boc-cut-dec-2026");

  await page.getByRole("button", { name: "English" }).click();
  await page.getByLabel("Date of birth").fill("1990-05-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByLabel("Email", { exact: true }).fill("sam@example.ca");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByRole("main").getByRole("link", { name: "Make your first call" })).toHaveAttribute("href", question);
});

test("a next that leaves the site, or carries a query, is dropped", async ({ page }) => {
  for (const next of ["//evil.com", "https://evil.com", "/en/../..", "/en/q/boc-cut-dec-2026?utm_source=mail"]) {
    await page.goto(`/en/sign-in?next=${encodeURIComponent(next)}`);
    await expect(page.getByRole("main").getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/en/welcome");
  }
  await page.goto(`/en/welcome?next=${encodeURIComponent("//evil.com")}`);
  await expect(page.getByRole("main").getByRole("link", { name: "Français" })).toHaveAttribute("href", "/fr/welcome?step=age");
});

test("the header language switch and sign-in button keep the question on onboarding and sign-in", async ({ page }) => {
  const question = "/en/q/boc-cut-dec-2026";
  const header = page.getByRole("banner");
  await page.goto(`/en/welcome?next=${question}`);
  await expect(header.getByRole("link", { name: "Français" })).toHaveAttribute("href", "/fr/welcome?next=/fr/q/boc-cut-dec-2026");
  await expect(page.getByRole("main").getByText("You’ll come back to this question after.")).toBeVisible();
  await header.getByRole("link", { name: "Français" }).click();
  await expect(page).toHaveURL(/\/fr\/welcome\?next=\/fr\/q\/boc-cut-dec-2026$/);
  await expect(page.getByRole("main").getByText("Vous reviendrez ensuite à cette question.")).toBeVisible();

  await page.goto(`/fr/sign-in?next=/fr/q/boc-cut-dec-2026`);
  await expect(header.getByRole("link", { name: "English" })).toHaveAttribute("href", `/en/sign-in?next=${question}`);
  await expect(page.getByRole("main").getByText("Vous reviendrez ensuite à cette question.")).toBeVisible();

  // No next, or an unsafe one: the plain other-language page, and no "come back" line.
  await page.goto(`/en/welcome?next=${encodeURIComponent("//evil.com")}`);
  await expect(header.getByRole("link", { name: "Français" })).toHaveAttribute("href", "/fr/welcome");
  await expect(page.getByRole("main").getByText("You’ll come back to this question after.")).toHaveCount(0);
});

test("the header sign-in button comes back to the question page, and onboarding's next", async ({ page, isMobile }) => {
  test.skip(isMobile, "the header sign-in button shows from desktop width");
  const header = page.getByRole("banner");
  const signIn = header.getByRole("link", { name: "Sign in" });
  await page.goto("/en/q/boc-cut-dec-2026");
  await expect(signIn).toHaveAttribute("href", "/en/sign-in?next=/en/q/boc-cut-dec-2026");
  await page.goto("/en/welcome?next=/en/q/boc-cut-dec-2026");
  await expect(signIn).toHaveAttribute("href", "/en/sign-in?next=/en/q/boc-cut-dec-2026");
  await page.goto("/en/today");
  await expect(signIn).toHaveAttribute("href", "/en/sign-in");
});
