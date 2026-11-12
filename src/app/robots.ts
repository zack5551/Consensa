import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/** Robots (M6 launch readiness). Pages are crawlable; the API is not. Private pages also carry noindex. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
