/**
 * Sends PULSE's editor emails through Amazon SES in Montréal (ca-central-1), the sender AEGIS and LEX named for the
 * app's email (docs/security/README.md). Plain `fetch` plus AWS Signature V4, so no SDK and no extra dependency.
 *
 * What goes out: draft questions written from public news, their risk scores and run counts. No user data.
 * Settings (all server-only, see `config.ts`): SES_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY, ENGINE_ALERT_EMAIL (the
 * recipient, never written in code), ENGINE_ALERT_FROM (defaults to the recipient, which SES allows once that address
 * is verified). The region is fixed to Montréal on purpose (CLAUDE.md rule 7), so there is no setting for it.
 */
import { createHash, createHmac } from "node:crypto";

/** Amazon SES in Montréal. The only email host the app calls (see tests/unit/security-guards.test.ts). */
export const SES_REGION = "ca-central-1";
const SES_URL = "https://email.ca-central-1.amazonaws.com/v2/email/outbound-emails";

export interface SesConfig {
  accessKeyId: string;
  secretAccessKey: string;
  from: string;
  to: string;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  now?: () => Date;
}

export interface Email {
  subject: string;
  text: string;
}

export type Mailer = (email: Email) => Promise<{ ok: boolean; error?: string }>;

const sha256 = (data: string) => createHash("sha256").update(data, "utf8").digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data, "utf8").digest();

/**
 * AWS Signature Version 4 for one request. Signs host, x-amz-date and any headers passed in.
 * Returns the headers to send (including Authorization). Checked against AWS's published test vectors.
 */
export function signV4(req: {
  method: string;
  url: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  body?: string;
  headers?: Record<string, string>;
  now: Date;
}): Record<string, string> {
  const url = new URL(req.url);
  const amzDate = req.now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...Object.fromEntries(Object.entries(req.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])), host: url.host, "x-amz-date": amzDate };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const query = [...url.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonical = [req.method, url.pathname || "/", query, canonicalHeaders, signedHeaders, sha256(req.body ?? "")].join("\n");
  const scope = `${day}/${req.region}/${req.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${req.secretAccessKey}`, day), req.region), req.service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign, "utf8").digest("hex");
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${req.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}

/** A mailer that sends plain-text email with the SES v2 SendEmail API. Never throws: a failed email never fails a run. */
export function sesMailer(cfg: SesConfig): Mailer {
  const doFetch = cfg.fetch ?? fetch;
  const now = cfg.now ?? (() => new Date());
  return async ({ subject, text }) => {
    const url = SES_URL;
    const body = JSON.stringify({
      FromEmailAddress: cfg.from,
      Destination: { ToAddresses: [cfg.to] },
      Content: { Simple: { Subject: { Data: subject, Charset: "UTF-8" }, Body: { Text: { Data: text, Charset: "UTF-8" } } } },
    });
    const headers = signV4({
      method: "POST",
      url,
      region: SES_REGION,
      service: "ses",
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      body,
      headers: { "content-type": "application/json" },
      now: now(),
    });
    // `host` is set by fetch itself; sending it again is refused by some runtimes.
    const send = Object.fromEntries(Object.entries(headers).filter(([k]) => k !== "host"));
    try {
      const res = await doFetch(url, { method: "POST", headers: send, body });
      if (res.ok) return { ok: true };
      return { ok: false, error: `SES ${res.status}: ${(await res.text()).slice(0, 200)}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
}
