/**
 * The public base URL for links search engines see. Same fallback as the
 * layout's metadataBase: local dev when NEXT_PUBLIC_SITE_URL is unset.
 */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
