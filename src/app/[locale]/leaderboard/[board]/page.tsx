/*
 * Screen: leaderboard for one province (or friends).
 * One message: who's most accurate in this region. A region opens only with enough forecasters (minimum cell size).
 * One action: find your row, or go back to the Canada board when the region is still too small.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeaderboardScreen, type BoardScope } from "@/components/leaderboard-screen";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { regionFromSlug, regionSlugs } from "@/lib/regions";

type Params = Promise<{ locale: string; board: string }>;

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) => [...regionSlugs, "friends"].map((board) => ({ locale, board })));
}

function scopeFor(board: string): BoardScope | null {
  if (board === "friends") return { kind: "friends" };
  const region = regionFromSlug(board);
  return region ? { kind: "region", region } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, board } = await params;
  const scope = scopeFor(board);
  if (!isLocale(locale) || !scope) return {};
  const t = getDictionary(locale);
  const name = scope.kind === "region" ? t.province.names[scope.region] : t.leaderboard.tabs.friends;
  return {
    title: `${t.leaderboard.title} · ${name}`,
    alternates: { languages: { "en-CA": `/en/leaderboard/${board}`, "fr-CA": `/fr/leaderboard/${board}` } },
  };
}

export default async function BoardPage({ params }: { params: Params }) {
  const { locale, board } = await params;
  const scope = scopeFor(board);
  if (!isLocale(locale) || !scope) notFound();
  return <LeaderboardScreen locale={locale} t={getDictionary(locale)} scope={scope} />;
}
