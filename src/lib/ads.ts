/**
 * Ad policy (LEX guardrails + Sean brief with ads). This is the single place the rules live, so the
 * ad network integration in M5 can't drift from them.
 *
 * - Slots: a native card in lists and a rail on desktop; a sticky phone banner only where the shell has room.
 * - Always labelled "Advertisement" / "Publicité".
 * - Never on a question page or its result, never inside the call flow, and an ad never gates a forecast.
 * - Blocked categories at the network: gambling, betting, lotteries, prediction markets, crypto trading.
 * - Until a paid ad fills a slot, it shows a labelled house ad from Consensa.
 */
export const blockedAdCategories = [
  "gambling",
  "sports-betting",
  "casino",
  "lottery",
  "prediction-markets",
  "crypto-trading",
  "cryptocurrency",
  "binary-options",
  "payday-loans",
] as const;

export const adSlots = {
  "today-native": { screen: "today", kind: "native" },
  "board-native": { screen: "board", kind: "native" },
  "board-rail": { screen: "board", kind: "rail" },
} as const;

export type AdSlotId = keyof typeof adSlots;

/** Screens where ads may never appear. */
const adFreeScreens = new Set(["question", "record", "methodology", "resolutions", "embed", "onboarding"]);

export function adsAllowedOn(screen: string): boolean {
  return !adFreeScreens.has(screen);
}

/** True when an advertiser's declared categories touch anything we block. */
export function isBlockedAdvertiser(categories: readonly string[]): boolean {
  const blocked = new Set<string>(blockedAdCategories);
  return categories.some((c) => blocked.has(c.toLowerCase()));
}
