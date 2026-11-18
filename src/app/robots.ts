import type { MetadataRoute } from "next";
import { isPreviewDeployment, siteUrl } from "@/lib/site-url";

/** Robots (M6 launch readiness). Pages are crawlable; the API is not. Private pages also carry noindex. Preview deployments are closed to crawlers. */
export default function robots(): MetadataRoute.Robots {
  if (isPreviewDeployment()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
