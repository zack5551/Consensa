import { BRAND_NAME } from "@/lib/brand";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { pageAlternates } from "@/lib/alternates";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { jsonLdString } from "@/lib/json-ld";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { isPreviewDeployment, siteUrl } from "@/lib/site-url";

afterEach(() => vi.unstubAllEnvs());

describe("siteUrl order", () => {
  it("prefers NEXT_PUBLIC_SITE_URL, then the production domain, then the deployment URL, then localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(siteUrl()).toBe("http://localhost:3000");
    vi.stubEnv("VERCEL_URL", "abc.vercel.app");
    expect(siteUrl()).toBe("https://abc.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "consensa.example");
    expect(siteUrl()).toBe("https://consensa.example");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.consensa.example");
    expect(siteUrl()).toBe("https://www.consensa.example");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x.test/");
    expect(siteUrl()).toBe("https://x.test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not a url");
    expect(siteUrl()).toBe("https://consensa.example");
  });

  it("treats only a non-production Vercel environment as a preview", () => {
    vi.stubEnv("VERCEL_ENV", "");
    expect(isPreviewDeployment()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isPreviewDeployment()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isPreviewDeployment()).toBe(true);
  });

  it("robots closes previews and leaves production unchanged", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
    vi.stubEnv("VERCEL_ENV", "production");
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/", disallow: "/api/" });
  });
});

describe("pageAlternates", () => {
  it("sets a self canonical and en-CA, fr-CA and x-default (English) links", () => {
    expect(pageAlternates("fr", "/q/abc")).toEqual({
      canonical: "/fr/q/abc",
      languages: { "en-CA": "/en/q/abc", "fr-CA": "/fr/q/abc", "x-default": "/en/q/abc" },
    });
    expect(pageAlternates("en", "").canonical).toBe("/en");
  });

  it("can build absolute URLs for the sitemap", () => {
    expect(pageAlternates("en", "/today", "https://x.test").languages["fr-CA"]).toBe("https://x.test/fr/today");
  });
});

describe("jsonLdString", () => {
  it("escapes < so text cannot close the script tag, and still parses back", () => {
    const out = jsonLdString({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});

describe("sitemap alternates", () => {
  it("gives every entry en-CA, fr-CA and x-default links", () => {
    for (const e of sitemap()) {
      const l = e.alternates?.languages as Record<string, string> | undefined;
      expect(Object.keys(l ?? {}).sort(), e.url).toEqual(["en-CA", "fr-CA", "x-default"]);
      expect(l?.["x-default"]).toBe(l?.["en-CA"]);
    }
  });
});

describe("brand name", () => {
  it("is written once: no app file spells the literal name outside BRAND_NAME", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && readFileSync(path, "utf8").includes(`"${BRAND_NAME}"`)) hits.push(path);
      }
    };
    walk(join(__dirname, "..", "..", "src", "app"));
    expect(hits).toEqual([]);
  });
});

describe("page descriptions", () => {
  const own = {
    resolutions: "resolutionsDescription",
    methodology: "methodologyDescription",
    terms: "termsDescription",
    privacy: "privacyDescription",
    leaderboard: "leaderboardDescription",
    provinces: "provincesDescription",
    record: "recordDescription",
  } as const;

  it("each main page names its own description, not the home one", () => {
    for (const [dir, key] of Object.entries(own)) {
      const page = readFileSync(`src/app/[locale]/${dir}/page.tsx`, "utf8");
      expect(page, dir).toContain(`description: getDictionary(locale).meta.${key}`);
    }
  });

  it("are short, distinct and different from the home description in both languages", () => {
    for (const t of [en, fr]) {
      const texts = Object.values(own).map((key) => t.meta[key]);
      expect(new Set(texts).size).toBe(texts.length);
      for (const text of texts) {
        expect(text).not.toBe(t.meta.description);
        expect(text.length).toBeGreaterThan(40);
        expect(text.length).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe("not-found metadata", () => {
  it("names the 404 in each language, falls back to English, and is never indexed", () => {
    expect(notFoundMetadata("en")).toEqual({ title: "Page not found", robots: { index: false } });
    expect(notFoundMetadata("fr")).toEqual({ title: "Page introuvable", robots: { index: false } });
    expect(notFoundMetadata("de")).toEqual(notFoundMetadata("en"));
    expect(notFoundMetadata(undefined)).toEqual(notFoundMetadata("en"));
  });
});
