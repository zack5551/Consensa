import "server-only";
import { createChallenge, verifySolution } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { z } from "zod";

/**
 * Self-hosted ALTCHA proof-of-work: the browser solves a small puzzle on the person's own device and we check the
 * answer here with our own HMAC key. No third party is called and nothing about the person is sent or stored.
 * `ALTCHA_HMAC_KEY` is a server-only env var. Without it (local dev, CI, or on Vercel before the key is added) the
 * check is skipped, so it can never block launch.
 */
export const CHALLENGE_TTL_SECONDS = 600;
const ALGORITHM = "PBKDF2/SHA-256";
/** 256 tries on average, each 10,000 hashing rounds: expect 1 to 2 seconds at the median on a low-end phone, solved in the background. */
const COST = 10_000;

let warned = false;
function hmacKey(): string | null {
  const key = process.env.ALTCHA_HMAC_KEY;
  if (key) return key;
  if (process.env.VERCEL && !warned) {
    warned = true;
    console.warn("ALTCHA_HMAC_KEY is not set: the bot check is skipped.");
  }
  return null;
}

/** A fresh signed challenge, or null when the check is off. */
export async function newChallenge() {
  const key = hmacKey();
  if (!key) return null;
  return createChallenge({ algorithm: ALGORITHM, cost: COST, deriveKey, hmacSignatureSecret: key, expiresAt: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS });
}

const payloadSchema = z.object({
  challenge: z.object({ parameters: z.object({ nonce: z.string().min(1).max(200) }).passthrough(), signature: z.string().max(200) }).passthrough(),
  solution: z.object({ counter: z.number().int().nonnegative(), derivedKey: z.string().max(400) }).passthrough(),
});

/**
 * Challenges already used, by nonce, kept until they would have expired anyway. This is in memory, so it is best
 * effort per server instance: a replay that lands on another instance can still pass until the challenge expires
 * (10 minutes). The rate limit on the call route covers that gap.
 */
const used = new Map<string, number>();
const MAX_USED = 10_000;

function remember(nonce: string, now: number): boolean {
  for (const [n, until] of used) {
    if (until > now) break; // entries are added in time order, so the rest are still live
    used.delete(n);
  }
  if (used.has(nonce)) return false;
  if (used.size >= MAX_USED) used.delete(used.keys().next().value as string);
  used.set(nonce, now + CHALLENGE_TTL_SECONDS * 1000);
  return true;
}

/** Decodes the widget's base64 payload; null when it isn't one. */
function decode(payload: string): z.infer<typeof payloadSchema> | null {
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(Buffer.from(payload, "base64").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function verifyBotCheck(payload: string | null): Promise<"pass" | "fail" | "skipped"> {
  const key = hmacKey();
  if (!key) return "skipped";
  if (!payload || payload.length > 4096) return "fail";
  const parsed = decode(payload);
  if (!parsed) return "fail";
  try {
    const result = await verifySolution({
      challenge: parsed.challenge as unknown as Parameters<typeof verifySolution>[0]["challenge"],
      solution: parsed.solution,
      deriveKey,
      hmacSignatureSecret: key,
    });
    if (!result.verified) return "fail";
  } catch {
    return "fail";
  }
  return remember(parsed.challenge.parameters.nonce, Date.now()) ? "pass" : "fail";
}
