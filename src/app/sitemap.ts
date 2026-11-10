import type { MetadataRoute } from "next";
import { sampleQuestions } from "@/content/sample-questions";
import { locales } from "@/i18n/config";
import { categories } from "@/lib/question";
import { regionSlugs } from "@/lib/regions";
import { siteUrl } from "@/lib/site-url";

/**
 * Sitemap (M6 launch readiness). Every public page a search engine should
 * find: the locale roots and static screens, every question, every browse
 * category, every leaderboard board and every province page.
 *
 * Deliberately left out: forecaster profiles — they are sample personas, not
 * real people, so they should not be indexed as if they were.
 */
const staticRoutes: ReadonlyArray<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "today", priority: 0.9, changeFrequency: "daily" },
  { path: "board", priority: 0.7, changeFrequency: "daily" },
  { path: "browse", priority: 0.7, changeFrequency: "daily" },
  { path: "search", priority: 0.7, changeFrequency: "daily" },
  { path: "record", priority: 0.6, changeFrequency: "weekly" },
  { path: "leaderboard", priority: 0.6, changeFrequency: "weekly" },
  { path: "provinces", priority: 0.6, changeFrequency: "weekly" },
  { path: "methodology", priority: 0.5, changeFrequency: "weekly" },
  { path: "resolutions", priority: 0.5, changeFrequency: "weekly" },
  { path: "welcome", priority: 0.4, changeFrequency: "monthly" },
  { path: "sign-in", priority: 0.4, changeFrequency: "monthly" },
  { path: "privacy", priority: 0.3, changeFrequency: "monthly" },
  { path: "terms", priority: 0.3, changeFrequency: "monthly" },
  { path: "design", priority: 0.3, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const url = (path: string) => `${base}${path}`;
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const route of staticRoutes) {
      entries.push({
        url: url(`/${locale}${route.path ? `/${route.path}` : ""}`),
        changeFrequency: route.changeFrequency,
        priority: route.priority,
      });
    }
    for (const category of categories) {
      entries.push({ url: url(`/${locale}/browse/${category}`), changeFrequency: "daily", priority: 0.7 });
    }
    for (const board of [...regionSlugs, "friends"]) {
      entries.push({ url: url(`/${locale}/leaderboard/${board}`), changeFrequency: "weekly", priority: 0.6 });
    }
    for (const region of regionSlugs) {
      entries.push({ url: url(`/${locale}/provinces/${region}`), changeFrequency: "weekly", priority: 0.6 });
    }
    for (const q of sampleQuestions) {
      entries.push({
        url: url(`/${locale}/q/${q.slug}`),
        lastModified: new Date(q.closesAt),
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  }

  return entries;
}
