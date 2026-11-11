import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  // HTTPS only, for two years, on every subdomain (AEGIS quality gate, 2026-11-11).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/**
 * The Content-Security-Policy (AEGIS, baseline rule 12).
 * - Scripts, styles, fonts and images load only from this site, so no tracker, font CDN or third-party script can be
 *   added by accident (CLAUDE.md rule 7). 'unsafe-inline' stays for scripts because pages are prerendered and Next
 *   inlines its bootstrap; per-request nonces would make every page dynamic. Revisit if pages go per-request.
 * - The browser may talk only to this site and our Supabase project, which limits where injected code could send data.
 * - No plugins, no <base> hijack, forms post only here, no framing of other sites.
 */
const dev = process.env.NODE_ENV !== "production";
function supabaseOrigins(): string {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return "";
    const { host } = new URL(url);
    return ` https://${host} wss://${host}`;
  } catch {
    return "";
  }
}
const baseCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${supabaseOrigins()}${dev ? " ws:" : ""}`,
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The app itself can't be framed…
      { source: "/((?!embed/).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: `${baseCsp}; frame-ancestors 'none'` }] },
      // …but the media embed widget is made to be.
      { source: "/embed/:path*", headers: [{ key: "Content-Security-Policy", value: `${baseCsp}; frame-ancestors *` }] },
    ];
  },
};

export default nextConfig;
