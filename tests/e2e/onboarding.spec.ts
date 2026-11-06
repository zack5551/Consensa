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
  await expect(page.getByRole("heading", { name: "Consensa is for people 18 and over" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Consensa is for people 18 and over" })).toBeVisible();
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
