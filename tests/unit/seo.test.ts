import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { pageAlternates } from "@/lib/alternates";
import { jsonLdString } from "@/lib/json-ld";
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
