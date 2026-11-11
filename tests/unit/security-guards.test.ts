/**
 * AEGIS guards: the security rules in docs/security/README.md, checked on every CI run so a later change can't
 * quietly weaken them. Each failure message says which rule broke.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
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

/** The engine endpoint is called by GitHub Actions with a bearer secret, not by a browser. */
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
    for (const file of routes.filter((f) => /api\/(account|calls)/.test(f))) {
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

  it("only the embed can be framed", () => {
    expect(appCsp).toMatch(/frame-ancestors 'none'/);
    expect(header("/((?!embed/).*)", "X-Frame-Options")).toBe("DENY");
    expect(embedCsp).toMatch(/frame-ancestors \*/);
  });
});
