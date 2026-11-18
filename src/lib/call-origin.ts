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
