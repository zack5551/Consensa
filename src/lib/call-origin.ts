/**
 * Only calls made from Canada count in the crowd. Vercel puts the visitor's 2-letter country in a request header;
 * this reads that one value and nothing else about where the request came from. Off Vercel (local dev and CI)
 * there is no such header, so calls are allowed.
 */
export const COUNTRY_HEADER = "x-vercel-ip-country";

export function callsCountFrom(country: string | null | undefined, onVercel: boolean): boolean {
  if (!onVercel) return true;
  return country === "CA";
}

/** How long a call waits for the connection check before it counts as unchecked (and is let through). */
export const PROXY_CHECK_TIMEOUT_MS = 150;

/** The answer from `work`, or `fallback` if it fails or takes longer than `ms`. The wait is always cleared. */
export async function withinTime<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([work.catch(() => fallback), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** A VPN share is shown only when at least this many checked calls are behind it, so it can't point at a few people. */
export const MIN_VPN_SAMPLE = 100;

/** Totals for a window, from `call_origin_share`: all call attempts from Canada that passed the bot check, those refused for a VPN or proxy, and those that couldn't be checked. */
export type CallOriginTotals = { total: number; vpn: number; unknown: number };

/** The whole-number percent of checked calls that came through a VPN or proxy, or null while there are too few to show. */
export function vpnSharePercent({ total, vpn, unknown }: CallOriginTotals): number | null {
  const checked = total - unknown;
  return checked >= MIN_VPN_SAMPLE && vpn >= 0 && vpn <= checked ? Math.round((vpn / checked) * 100) : null;
}
