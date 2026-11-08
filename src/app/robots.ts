import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/** Robots (M6 launch readiness). Everything is crawlable; the sitemap is listed. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
