/**
 * Sign-in with a platform, only to learn one thing: the account's stable numeric id (and, on X, when the account
 * was created). The smallest scope the platform allows, no refresh token, and the access token is used once, then
 * revoked and dropped: it is never returned from here, stored or logged (AEGIS: store no tokens).
 */
import { z } from "zod";
import type { FetchFn, Platform } from "./types";

export interface SocialIdentity {
  platformUserId: string;
  /** When the social account was created (ISO), or null when the platform doesn't say. */
  createdAt: string | null;
}

export interface LinkProvider {
  readonly platform: Platform;
  /** False until the platform's app is set up and approved. */
  available(): boolean;
  authorizeUrl(input: { state: string; challenge: string; redirectUri: string }): string | null;
  identify(input: { code: string; verifier: string; redirectUri: string }): Promise<SocialIdentity | null>;
}

// Outside hosts (rule 7): the person signs in on X itself; our server then asks X for the id once.
const X_AUTHORIZE = "https://x.com/i/oauth2/authorize";
const X_API = "https://api.x.com/2";
/** Identity only. X needs `tweet.read` beside `users.read` to answer "who is this"; nothing else is asked for. */
export const X_SCOPE = "users.read tweet.read";

const tokenSchema = z.object({ access_token: z.string().min(1).max(4096) });
const meSchema = z.object({ data: z.object({ id: z.string().regex(/^[0-9]{1,30}$/), created_at: z.iso.datetime().optional() }) });

export class XLinkProvider implements LinkProvider {
  readonly platform = "x" as const;
  private readonly fetch: FetchFn;

  constructor(private readonly config: { clientId?: string; clientSecret?: string; fetch?: FetchFn }) {
    this.fetch = config.fetch ?? fetch;
  }

  available(): boolean {
    return Boolean(this.config.clientId);
  }

  authorizeUrl({ state, challenge, redirectUri }: { state: string; challenge: string; redirectUri: string }): string | null {
    if (!this.config.clientId) return null;
    const query = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      scope: X_SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return `${X_AUTHORIZE}?${query.toString()}`;
  }

  private clientHeaders(): Record<string, string> {
    const { clientId, clientSecret } = this.config;
    return clientSecret ? { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` } : {};
  }

  async identify({ code, verifier, redirectUri }: { code: string; verifier: string; redirectUri: string }): Promise<SocialIdentity | null> {
    const clientId = this.config.clientId;
    if (!clientId) return null;
    let accessToken: string | null = null;
    try {
      const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier, client_id: clientId });
      const tokenRes = await this.fetch(`${X_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...this.clientHeaders() },
        body: form.toString(),
        cache: "no-store",
      });
      if (!tokenRes.ok) return null;
      const token = tokenSchema.safeParse(await tokenRes.json());
      if (!token.success) return null;
      accessToken = token.data.access_token;

      const meRes = await this.fetch(`${X_API}/users/me?user.fields=created_at`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      if (!meRes.ok) return null;
      const me = meSchema.safeParse(await meRes.json());
      return me.success ? { platformUserId: me.data.data.id, createdAt: me.data.data.created_at ?? null } : null;
    } catch {
      return null;
    } finally {
      // Done with the token: ask X to revoke it. Best effort, and either way it goes no further than this function.
      if (accessToken) {
        const form = new URLSearchParams({ token: accessToken, token_type_hint: "access_token", client_id: clientId });
        await this.fetch(`${X_API}/oauth2/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", ...this.clientHeaders() },
          body: form.toString(),
          cache: "no-store",
        }).catch(() => undefined);
      }
    }
  }
}

/**
 * Facebook, Instagram and Threads: a stand-in behind the same interface until Meta approves the app. It can't
 * start a sign-in and never calls Meta, so nothing can be linked on those platforms yet.
 */
export class MetaLinkProvider implements LinkProvider {
  constructor(readonly platform: Exclude<Platform, "x">) {}

  available(): boolean {
    return false;
  }

  authorizeUrl(): string | null {
    return null;
  }

  async identify(): Promise<SocialIdentity | null> {
    return null;
  }
}

export function linkProvider(platform: Platform, env: { X_CLIENT_ID?: string; X_CLIENT_SECRET?: string }, fetchFn?: FetchFn): LinkProvider {
  return platform === "x" ? new XLinkProvider({ clientId: env.X_CLIENT_ID, clientSecret: env.X_CLIENT_SECRET, fetch: fetchFn }) : new MetaLinkProvider(platform);
}
