"use client";

import { useEffect } from "react";
import type { Locale } from "@/i18n/config";
import { track } from "@/lib/analytics";

/** Sends `leaderboard_viewed` with the board's tab. Renders nothing. */
export function LeaderboardViewed({ locale, tab }: { locale: Locale; tab: "province" | "canada" | "friends" }) {
  useEffect(() => {
    track("leaderboard_viewed", { locale, tab });
  }, [locale, tab]);
  return null;
}
