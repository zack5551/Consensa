/*
 * Screen: leaderboard, Canada.
 * One message: who's most accurate across Canada, ranked by skill vs the crowd, never by points.
 * One action: find your row ("Jump to your row").
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeaderboardScreen } from "@/components/leaderboard-screen";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).leaderboard.title, alternates: { languages: { "en-CA": "/en/leaderboard", "fr-CA": "/fr/leaderboard" } } };
}

export default async function LeaderboardPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LeaderboardScreen locale={locale} t={getDictionary(locale)} scope={{ kind: "canada" }} />;
}
