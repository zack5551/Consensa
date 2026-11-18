import { z } from "zod";

const urlSchema = z.string().url();

/** A candidate URL with trailing slashes removed, or undefined when it is empty or not a valid URL. */
function clean(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.replace(/\/+$/, "");
  return urlSchema.safeParse(trimmed).success ? trimmed : undefined;
}

/**
 * The public base URL for links search engines see. One function for the layout's metadataBase,
 * the sitemap, robots and the structured data. Order:
 * NEXT_PUBLIC_SITE_URL, then the Vercel production domain, then this deployment's URL, then local dev.
 * Trailing slashes are removed, and an invalid value falls through to the next option.
 */
export function siteUrl(): string {
  const env = process.env;
  return (
    clean(env.NEXT_PUBLIC_SITE_URL) ??
    clean(env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`) ??
    clean(env.VERCEL_URL && `https://${env.VERCEL_URL}`) ??
    "http://localhost:3000"
  );
}

/** True on a Vercel preview or development deployment. Production and local runs are not previews. */
export function isPreviewDeployment(): boolean {
  const env = process.env.VERCEL_ENV;
  return Boolean(env) && env !== "production";
}
