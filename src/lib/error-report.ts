/**
 * Error reports (AEGIS, LEX): what the in-house error log keeps, scrubbed so nothing personal is stored. Errors go to
 * a private table in the Montréal database (no outside error service). We keep where it broke and what broke, never
 * who: no IP, email, cookies, headers, query strings, request bodies or form values. Anything in the error text that
 * could echo what someone typed (quoted text, emails, numbers, tokens) is masked. Kept 90 days (Privacy Policy §8).
 */
import { z } from "zod";

export type ErrorSource = "server" | "browser";

export type ErrorEvent = {
  source: ErrorSource;
  route: string;
  name: string;
  message: string;
  digest: string | null;
  stack: string | null;
};

const LIMITS = { route: 200, name: 100, message: 500, stack: 4000 } as const;

/** Only the path: drops the query string, the fragment and any host, and masks segments that look like ids or emails. */
export function scrubRoute(raw: string): string {
  let path = raw;
  try {
    path = new URL(raw, "http://localhost").pathname;
  } catch {
    path = raw.split(/[?#]/)[0] ?? "";
  }
  const clean = path
    .split("/")
    .map((seg) => (/@|^\d{4,}$|^[0-9a-f-]{20,}$/i.test(seg) ? ":id" : seg))
    .join("/");
  return (clean.startsWith("/") ? clean : `/${clean}`).slice(0, LIMITS.route);
}

/** Masks anything in free text that could be personal or a secret. */
export function scrubText(raw: string, max: number): string {
  return raw
    .replace(/https?:\/\/[^\s"'<>]+/g, (u) => {
      try {
        const url = new URL(u);
        return `${url.origin}${url.pathname}`;
      } catch {
        return "[url]";
      }
    })
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(/\b(sb_(publishable|secret)_|sk-|Bearer\s+)[\w.-]+/gi, "[token]")
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, "[ip]")
    .replace(/(?<![\w.:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w:])/gi, "[ip]")
    .replace(/"[^"\n]{1,200}"|'[^'\n]{1,200}'|`[^`\n]{1,200}`|«[^»\n]{1,200}»/g, "[text]")
    .replace(/\b\d{5,}\b/g, "[n]")
    .slice(0, max);
}

/** The only shape the browser may send. Unknown fields are dropped, so a form value can't ride along. */
export const browserErrorSchema = z.object({
  route: z.string().max(2000),
  name: z.string().max(200).default("Error"),
  message: z.string().max(2000).default(""),
  digest: z.string().regex(/^[\w-]{1,64}$/).optional(),
});

export function toErrorEvent(source: ErrorSource, input: { route: string; name?: string; message?: string; digest?: string; stack?: string }): ErrorEvent {
  return {
    source,
    route: scrubRoute(input.route),
    name: scrubText(input.name || "Error", LIMITS.name),
    message: scrubText(input.message ?? "", LIMITS.message),
    digest: input.digest && /^[\w-]{1,64}$/.test(input.digest) ? input.digest : null,
    // Only the server's own stack: browser stacks can include page text, so they are not kept.
    stack: source === "server" && input.stack ? scrubText(input.stack, LIMITS.stack) : null,
  };
}
