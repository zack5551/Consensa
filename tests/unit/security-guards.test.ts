/**
 * AEGIS guards: the security rules in docs/security/README.md, checked on every CI run so a later change can't
 * quietly weaken them. Each failure message says which rule broke.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";

const root = join(__dirname, "..", "..");

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full, pattern) : pattern.test(name) ? [full] : [];
  });
}

const rel = (f: string) => relative(root, f);
const read = (f: string) => readFileSync(f, "utf8");
const routes = files(join(root, "src", "app", "api"), /^route\.ts$/);
const source = files(join(root, "src"), /\.(ts|tsx)$/);

/** The engine endpoint is called by GitHub Actions or Vercel Cron with a bearer secret, not by a browser. */
const machineRoutes = ["src/app/api/engine/cycle/route.ts"];

describe("API routes", () => {
  it("finds the routes", () => {
    expect(routes.length).toBeGreaterThan(4);
  });

  for (const file of routes) {
    const code = read(file);
    const name = rel(file);
    const writes = /export async function (POST|PUT|PATCH|DELETE)\b/.test(code);
    if (!writes) continue;

    if (machineRoutes.includes(name)) {
      it(`${name} compares its secret in constant time`, () => {
        expect(code, "engine endpoint must use timingSafeEqual").toMatch(/timingSafeEqual/);
      });
      continue;
    }

    it(`${name} refuses writes from other sites (rule: same-origin)`, () => {
      expect(code, "a write route needs sameOrigin() or an Origin check").toMatch(/sameOrigin\(|origin !== request\.nextUrl\.origin/);
    });

    if (!name.endsWith("auth/sign-out/route.ts")) {
      it(`${name} is rate-limited and validates its body (rules 8 and 9)`, () => {
        expect(code, "a write route needs a rateLimiter").toMatch(/rateLimiter\(/);
        expect(code, "a write route needs a Zod safeParse").toMatch(/safeParse\(/);
      });
    }
  }

  it("every account route answers with no-store, so personal data is never cached", () => {
    for (const file of routes.filter((f) => /api\/(account|calls|session)/.test(f))) {
      expect(read(file), rel(file)).toMatch(/noStore/);
    }
  });
});

describe("secret key (rule 2)", () => {
  it("only server code imports the secret-key client", () => {
    for (const file of source) {
      const code = read(file);
      if (!/from "@\/lib\/supabase\/(admin|account-server)"/.test(code)) continue;
      expect(code, `${rel(file)} imports the secret-key client from a browser component`).not.toMatch(/^["']use client["']/m);
    }
  });

  it("the secret-key modules are server-only", () => {
    for (const f of ["src/lib/supabase/admin.ts", "src/lib/supabase/account-server.ts"]) {
      expect(read(join(root, f)), f).toMatch(/^import "server-only";/m);
    }
  });

  it("no secret is exposed to the browser through a NEXT_PUBLIC_ name", () => {
    for (const file of source) {
      expect(read(file), rel(file)).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE_ROLE|PRIVATE)/);
    }
  });
});

describe("logs (rule 11)", () => {
  it("API routes and account code never log", () => {
    for (const file of [...routes, ...files(join(root, "src", "lib", "supabase"), /\.ts$/)]) {
      expect(read(file), `${rel(file)} must not log (no emails, IPs or tokens in logs)`).not.toMatch(/console\.(log|info|warn|error|debug)/);
    }
  });
});

describe("caller address (AEGIS)", () => {
  it("only src/lib/server/proxy-check.ts reads the address headers", () => {
    for (const file of source.filter((f) => rel(f) !== join("src", "lib", "server", "proxy-check.ts"))) {
      expect(read(file), `${rel(file)} must use callerIp() from proxy-check.ts`).not.toMatch(/x-real-ip|x-forwarded-for/i);
    }
  });
});

describe("headers", async () => {
  const rules = await nextConfig.headers!();
  const header = (source: string, key: string) => rules.find((r) => r.source === source)?.headers.find((h) => h.key === key)?.value ?? "";
  const appCsp = header("/((?!embed/).*)", "Content-Security-Policy");
  const embedCsp = header("/embed/:path*", "Content-Security-Policy");

  it("HSTS covers subdomains for two years", () => {
    expect(header("/:path*", "Strict-Transport-Security")).toMatch(/max-age=63072000; includeSubDomains/);
  });

  it("the CSP keeps third parties out (rules 7 and 12)", () => {
    for (const csp of [appCsp, embedCsp]) {
      expect(csp).toMatch(/default-src 'self'/);
      expect(csp).toMatch(/object-src 'none'/);
      expect(csp).toMatch(/base-uri 'self'/);
      expect(csp).toMatch(/form-action 'self'/);
      expect(csp).toMatch(/frame-src 'none'/);
      expect(csp).toMatch(/font-src 'self'(;|$)/);
      expect(csp, "scripts come from this site only").toMatch(/script-src 'self' 'unsafe-inline'(;| 'unsafe-eval';)/);
    }
  });

  it("social API hosts are never in the policy, flag on or off (sprint 11, AEGIS)", async () => {
    const hosts = ["api.x.com", "graph.facebook.com", "graph.threads.net"];
    for (const host of hosts) expect(appCsp).not.toContain(host);
    vi.stubEnv("SOCIAL_VOTING", "1");
    vi.resetModules();
    const on = (await (await import("../../next.config")).default.headers!()).flatMap((r) => r.headers).filter((h) => h.key === "Content-Security-Policy");
    vi.unstubAllEnvs();
    vi.resetModules();
    expect(on.length).toBeGreaterThan(0);
    for (const h of on) for (const host of hosts) expect(h.value).not.toContain(host);
  });

  it("only the embed can be framed", () => {
    expect(appCsp).toMatch(/frame-ancestors 'none'/);
    expect(header("/((?!embed/).*)", "X-Frame-Options")).toBe("DENY");
    expect(embedCsp).toMatch(/frame-ancestors \*/);
  });
});

/**
 * Outside hosts (CLAUDE.md rules 7 and 8). Every web address in src must sit under one of these domains: official
 * Canadian sources, the news and award sites questions cite, and the feeds PULSE reads on the server. A new host
 * fails this test until someone checks it: no tracker or font CDN (data stays in Canada), and no sportsbook,
 * casino, lottery, prediction-market or crypto-trading site. Add a domain here only after that check, with the
 * reason in the PR.
 */
const allowedDomains = [
  // Official Canadian sources
  "statcan.gc.ca", "bankofcanada.ca", "banqueducanada.ca", "canada.ca", "gc.ca", "cmhc-schl.gc.ca", "elections.ca",
  // News outlets and cultural bodies cited as resolution sources
  "cbc.ca", "radio-canada.ca", "globalnews.ca", "crea.ca", "academy.ca", "telefilm.ca", "numeris.ca",
  "junoawards.ca", "gillerprize.ca", "scotiabankgillerprize.ca", "polarismusicprize.ca", "nhl.com", "cfl.ca",
  "nasa.gov", "nobelprize.org", "imdb.com", "boxofficemojo.com",
  // Read by the engine on the server only; no user data is sent
  "trends.google.com",
  // A credit link on the methodology page (CC BY-SA 4.0 attribution for the IP2Proxy LITE database). The lookup itself
  // reads a local file on our server; the database is fetched at build time by scripts/fetch-ip2proxy.mjs, not at run time.
  "lite.ip2location.com",
  "creativecommons.org",
  // Not network calls: the SVG namespace, the structured-data vocabulary name and the local dev fallback
  "www.w3.org", "schema.org", "localhost",
];

/**
 * Share and poll links, and nothing else: plain links a person follows from the question page (intent URLs and our
 * own post URLs). We load no script, SDK or image from them and send no data, so nothing leaves until a click.
 * These match the exact host only, never a subdomain, so an API or embed host (api.x.com, graph.facebook.com,
 * platform.twitter.com) still fails this test until it is added on purpose, with its own check.
 */
const allowedExactHosts = new Set([
  "twitter.com", "x.com", "www.x.com", "threads.net", "www.threads.net", "threads.com", "www.threads.com",
  "instagram.com", "www.instagram.com", "facebook.com", "www.facebook.com",
]);

/**
 * Social voting (sprint 11), added on purpose: LEX cleared it (data only comes in, rule 7 holds) and AEGIS note 8
 * says these hosts go into the allowlist and the CSP in this PR only. Called by our server only, never by a page
 * script, and only while SOCIAL_VOTING is on. Exact hosts, like the share links above:
 * - api.x.com: replies and poll totals on our own posts, and the numeric id once when a person links;
 * - graph.facebook.com: comments on our own Facebook Page and Instagram posts;
 * - graph.threads.net: replies on our own Threads posts.
 * (Signing in to link happens on x.com itself, already listed above as a plain link the person follows.)
 */
const allowedApiHosts = new Set(["api.x.com", "graph.facebook.com", "graph.threads.net"]);

/**
 * PULSE's editor email (2026-11-25): Amazon SES in Montréal, the sender docs/security/README.md names for app email.
 * Server only, from src/engine/notify. It carries draft questions and run counts, never user data. Exact host only,
 * so SES in any other region still fails this test.
 */
const allowedEmailHosts = new Set(["email.ca-central-1.amazonaws.com"]);

/** Packages that send visitor data to a third party. Rule 7: none without a privacy review and LEX's check. */
const trackerPackages = [
  /^@vercel\/(analytics|speed-insights)$/, /google-analytics|^react-ga|gtag|^@next\/third-parties$/, /^@segment\//,
  /mixpanel/, /hotjar/, /fullstory/, /^@amplitude\//, /facebook-pixel|^react-facebook/, /^@datadog\/browser/,
  /^logrocket/, /^posthog-js$/,
];

describe("outside hosts", () => {
  const allowed = (host: string) => allowedExactHosts.has(host) || allowedApiHosts.has(host) || allowedEmailHosts.has(host) || allowedDomains.some((d) => host === d || host.endsWith(`.${d}`));

  it("share hosts match exactly: no other social API or embed host gets through", () => {
    for (const host of ["api.twitter.com", "platform.twitter.com", "upload.x.com", "ads-api.x.com", "connect.facebook.net", "graph.instagram.com", "www.graph.facebook.com", "pixel.facebook.com"]) {
      expect(allowed(host), host).toBe(false);
    }
    expect(allowed("www.facebook.com")).toBe(true);
  });

  it("the three social-voting API hosts are used only by the server-side adapters in src/lib/social-voting", () => {
    expect([...allowedApiHosts].sort()).toEqual(["api.x.com", "graph.facebook.com", "graph.threads.net"]);
    const users = source.filter((f) => [...allowedApiHosts].some((host) => read(f).includes(host))).map(rel);
    expect(users.sort()).toEqual(["src/lib/social-voting/link-providers.ts", "src/lib/social-voting/providers/meta.ts", "src/lib/social-voting/providers/x.ts"]);
    for (const f of users) expect(read(join(root, f)), f).not.toMatch(/^["']use client["']/m);
  });

  it("the email host is used only by PULSE's server-side notifier", () => {
    const users = source.filter((f) => [...allowedEmailHosts].some((host) => read(f).includes(host))).map(rel);
    expect(users).toEqual(["src/engine/notify/ses.ts"]);
  });

  for (const file of source) {
    const hosts = [...read(file).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]!.toLowerCase());
    const unknown = [...new Set(hosts.filter((h) => !allowed(h)))];
    if (unknown.length === 0) continue;
    it(`${rel(file)} only links to checked hosts`, () => {
      expect(unknown, "new outside host: check rules 7 and 8, then add it to allowedDomains").toEqual([]);
    });
  }

  it("every source file was scanned", () => {
    expect(source.length).toBeGreaterThan(50);
  });

  it("no tracker packages (rule 7)", () => {
    const pkg = JSON.parse(read(join(root, "package.json"))) as Record<string, Record<string, string> | undefined>;
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const trackers = names.filter((n) => trackerPackages.some((p) => p.test(n)));
    expect(trackers, "tracker package: needs a privacy review and LEX's check first").toEqual([]);
  });

  it("no script tags pointing off-site", () => {
    const offsite = source.filter((f) => /<script[^>]+src=["'{]?\s*["'`]?https?:/i.test(read(f))).map(rel);
    expect(offsite).toEqual([]);
  });
});
