/**
 * Calls live in this browser (localStorage) so the page answers instantly. When accounts are on and you're signed
 * in, every saved call is also sent to the server, and your server calls are pulled into this browser once per
 * page load: the same calls follow you to any device. Every read and write is guarded: private windows and
 * blocked storage fall back to memory.
 */
import { takeBotCheck, warmBotCheck } from "@/lib/bot-check-client";
import { accountsEnabled } from "@/lib/supabase/env";

const PREFIX = "consensa:call:";
const EVENT = "consensa:calls";
const OUTSIDE_EVENT = "consensa:calls-outside";
let outsideCanada = false;
let botCheckFailed = false;
const memory = new Map<string, number>();

function valid(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 99;
}

export function readCall(slug: string): number | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + slug);
    if (raw !== null) {
      const n = Number(raw);
      return valid(n) ? n : null;
    }
  } catch {
    /* storage blocked */
  }
  return memory.get(slug) ?? null;
}

export function saveCall(slug: string, value: number): void {
  storeCall(slug, value);
  if (accountsEnabled) pushCall(slug, value);
}

function storeCall(slug: string, value: number): void {
  if (!valid(value)) throw new RangeError(`A call is a whole percent from 1 to 99, got ${value}`);
  memory.set(slug, value);
  try {
    window.localStorage.setItem(PREFIX + slug, String(value));
  } catch {
    /* storage blocked: memory only */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function readAllCalls(slugs: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const slug of slugs) {
    const v = readCall(slug);
    if (v !== null) out[slug] = v;
  }
  return out;
}

/** Re-render when a call is saved in this tab or another one. */
export function subscribeCalls(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(PREFIX)) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** True while the server's latest answer was that a call came from outside Canada: it stays on this device and doesn't count in the crowd. */
export function isOutsideCanada(): boolean {
  return outsideCanada;
}

/** True while the server's latest answer was that the bot check didn't pass: the call stays on this device. */
export function isBotCheckFailed(): boolean {
  return botCheckFailed;
}

export function subscribeOutsideCanada(onChange: () => void): () => void {
  window.addEventListener(OUTSIDE_EVENT, onChange);
  return () => window.removeEventListener(OUTSIDE_EVENT, onChange);
}

/**
 * The database takes one change per call every 2 seconds. Each question sends one request at a time, and the gap is
 * measured from the moment the previous request went out. While one waits or is in flight, only the newest value is
 * kept: a newer value replaces an older one that hasn't been sent.
 */
const PUSH_GAP_MS = 2100;
const lastPush = new Map<string, number>();
const latest = new Map<string, number>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Set<string>();

export function pushCall(slug: string, probability: number): void {
  latest.set(slug, probability);
  schedule(slug);
}

function schedule(slug: string): void {
  if (inflight.has(slug) || timers.has(slug) || !latest.has(slug)) return;
  const wait = (lastPush.get(slug) ?? -Infinity) + PUSH_GAP_MS - Date.now();
  if (wait <= 0) void run(slug);
  else
    timers.set(
      slug,
      setTimeout(() => {
        timers.delete(slug);
        void run(slug);
      }, wait),
    );
}

async function run(slug: string): Promise<void> {
  inflight.add(slug);
  try {
    const altcha = await takeBotCheck(); // already solved in the background, so this is immediate
    const probability = latest.get(slug); // read after the wait: a newer value wins
    if (probability === undefined) return;
    latest.delete(slug);
    lastPush.set(slug, Date.now());
    await sendCall(slug, probability, altcha);
  } finally {
    inflight.delete(slug);
    schedule(slug);
  }
}

/** Sends one call to the server. Not signed in, or the question has closed: the call stays in this browser. */
async function sendCall(slug: string, probability: number, altcha: string | null): Promise<boolean> {
  try {
    // The bot check was solved on this device in the background and goes in the `x-altcha` header; none when the check is off.
    const res = await fetch("/api/calls", { method: "POST", headers: { "Content-Type": "application/json", ...(altcha ? { "x-altcha": altcha } : {}) }, body: JSON.stringify({ slug, probability }) });
    const refused = res.status === 403 ? ((await res.json().catch(() => null)) as { error?: unknown } | null)?.error : null;
    // A later call that counted clears both notes: back in Canada, or a one-off bad read, so they would now be wrong.
    const next = res.ok ? { outside: false, bot: false } : { outside: refused === "outside canada" || (outsideCanada && refused !== "bot check"), bot: refused === "bot check" || (botCheckFailed && refused !== "outside canada") };
    if (next.outside !== outsideCanada || next.bot !== botCheckFailed) {
      outsideCanada = next.outside;
      botCheckFailed = next.bot;
      window.dispatchEvent(new Event(OUTSIDE_EVENT));
    }
    return res.ok;
  } catch {
    return false;
  }
}

let pulled = false;

/**
 * Once per page load: brings your server calls into this browser, then sends up any call made on this device
 * before you signed in. The server's value wins when both exist.
 */
export async function syncCalls(): Promise<void> {
  if (!accountsEnabled || pulled) return;
  pulled = true;
  warmBotCheck();
  try {
    const res = await fetch("/api/calls", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { signedIn?: boolean; calls?: Record<string, unknown> };
    if (!body.signedIn) return;
    const server = body.calls ?? {};
    for (const [slug, v] of Object.entries(server)) if (typeof v === "number" && valid(v)) storeCall(slug, v);
    for (const slug of localSlugs()) {
      const v = readCall(slug);
      if (v !== null && !(slug in server)) pushCall(slug, v);
    }
  } catch {
    /* offline: try again on the next page load */
  }
}

function localSlugs(): string[] {
  try {
    return Object.keys(window.localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .map((k) => k.slice(PREFIX.length));
  } catch {
    return [...memory.keys()];
  }
}
