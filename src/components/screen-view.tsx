"use client";

import { useEffect } from "react";
import type { Locale } from "@/i18n/config";
import { sourceFromReferrer, track, type Screen } from "@/lib/analytics";
import { syncCalls } from "@/lib/calls-store";

type Props = { locale: Locale; screen: Screen; slug?: string; state?: string };

const FIRST_OPEN = "consensa:first-open";
const LAST_OPEN = "consensa:last-open";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sends the screen's view events (see src/lib/analytics.ts). `app_opened` fires once per day per browser,
 * which is what day-7 retention and DAU/MAU are built from. Also syncs your calls with your account once per
 * page load when you're signed in. Renders nothing.
 */
export function ScreenView({ locale, screen, slug, state }: Props) {
  useEffect(() => {
    void syncCalls();
    let first = today();
    let last: string | null = null;
    try {
      first = window.localStorage.getItem(FIRST_OPEN) ?? first;
      last = window.localStorage.getItem(LAST_OPEN);
      window.localStorage.setItem(FIRST_OPEN, first);
      window.localStorage.setItem(LAST_OPEN, today());
    } catch {
      /* storage blocked: count as a fresh open */
    }
    if (last !== today()) {
      const daysSinceFirstOpen = Math.max(0, Math.round((Date.parse(today()) - Date.parse(first)) / 86_400_000));
      const utm = new URLSearchParams(window.location.search).get("utm_source");
      track("app_opened", { locale, screen, source: sourceFromReferrer(document.referrer, utm), daysSinceFirstOpen });
    }
    track("screen_viewed", { locale, screen });
    if (screen === "question" && slug) {
      const ref = document.referrer;
      const from = ref.includes("/board") ? "board" : ref && new URL(ref).origin === window.location.origin ? "today" : "direct";
      track("question_viewed", { locale, slug, state: state ?? "open", from });
    }
  }, [locale, screen, slug, state]);
  return null;
}
