import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { sampleQuestions } from "@/content/sample-questions";
import { categories } from "@/lib/question";
import { regionSlugs } from "@/lib/regions";
import { siteUrl } from "@/lib/site-url";

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it("lists every public route in both languages, with no duplicates", () => {
    expect(new Set(urls).size).toBe(urls.length);
    for (const locale of ["en", "fr"]) {
      expect(urls).toContain(`${siteUrl()}/${locale}`);
      expect(urls).toContain(`${siteUrl()}/${locale}/today`);
      expect(urls).toContain(`${siteUrl()}/${locale}/board`);
      expect(urls).toContain(`${siteUrl()}/${locale}/methodology`);
      expect(urls).toContain(`${siteUrl()}/${locale}/resolutions`);
      expect(urls).toContain(`${siteUrl()}/${locale}/privacy`);
      for (const category of categories) {
        expect(urls).toContain(`${siteUrl()}/${locale}/browse/${category}`);
      }
      for (const region of regionSlugs) {
        expect(urls).toContain(`${siteUrl()}/${locale}/provinces/${region}`);
        expect(urls).toContain(`${siteUrl()}/${locale}/leaderboard/${region}`);
      }
      expect(urls).toContain(`${siteUrl()}/${locale}/leaderboard/friends`);
      for (const q of sampleQuestions) {
        expect(urls).toContain(`${siteUrl()}/${locale}/q/${q.slug}`);
      }
    }
  });

  it("gives questions their close date as lastModified", () => {
    const entry = entries.find((e) => e.url === `${siteUrl()}/en/q/boc-cut-dec-2026`);
    expect(entry?.lastModified).toEqual(new Date("2026-12-09T14:45:00Z"));
    expect(entry?.priority).toBe(0.8);
  });

  it("leaves sample forecaster profiles out of the sitemap", () => {
    expect(urls.some((u) => u.includes("/forecasters/"))).toBe(false);
  });
});

describe("robots", () => {
  it("allows every page, keeps crawlers off the API and points at the sitemap", () => {
    const r = robots();
    expect(r.sitemap).toBe(`${siteUrl()}/sitemap.xml`);
    expect(r.rules).toEqual({ userAgent: "*", allow: "/", disallow: "/api/" });
  });
});

describe("private pages stay out of search (AEGIS)", () => {
  const privatePages = ["record", "search", "welcome", "sign-in", "design"];

  it("the sitemap leaves them out", () => {
    const urls = sitemap().map((e) => e.url);
    for (const p of privatePages) expect(urls.some((u) => u.endsWith(`/${p}`)), p).toBe(false);
  });

  it("each one is marked noindex", () => {
    for (const p of privatePages) {
      const code = readFileSync(join(__dirname, "..", "..", "src", "app", "[locale]", p, "page.tsx"), "utf8");
      expect(code, p).toMatch(/robots: \{ index: false \}/);
    }
  });

  it("robots keeps crawlers off the API", () => {
    expect(robots().rules).toMatchObject({ disallow: "/api/" });
  });
});
