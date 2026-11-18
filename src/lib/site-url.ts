/**
 * The public base URL for links search engines see. One function for the layout's metadataBase,
 * the sitemap, robots and the structured data. Order:
 * NEXT_PUBLIC_SITE_URL, then the Vercel production domain, then this deployment's URL, then local dev.
 */
export function siteUrl(): string {
  const env = process.env;
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL;
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** True on a Vercel preview or development deployment. Production and local runs are not previews. */
export function isPreviewDeployment(): boolean {
  const env = process.env.VERCEL_ENV;
  return Boolean(env) && env !== "production";
}
