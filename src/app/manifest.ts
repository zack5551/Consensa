import type { MetadataRoute } from "next";
import { BRAND_NAME } from "@/lib/brand";

/** Web app manifest. Colours are PRISM's paper (light background) and ink (brand) values from brand/tokens. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: "What Canada thinks happens next. · Ce que le Canada prévoit.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF8F5",
    theme_color: "#14213D",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
