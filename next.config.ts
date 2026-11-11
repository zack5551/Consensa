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
 * CSP directives that are safe with Next's inline scripts: no plugins, no <base> hijack, forms post only here.
 * A full script-src policy needs per-request nonces; that lands with accounts (see docs/security/README.md).
 */
const baseCsp = "object-src 'none'; base-uri 'self'; form-action 'self'";

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
