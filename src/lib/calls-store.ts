/**
 * Calls live in this browser (localStorage) so the page answers instantly. When accounts are on and you're signed
 * in, every saved call is also sent to the server, and your server calls are pulled into this browser once per
 * page load: the same calls follow you to any device. Every read and write is guarded: private windows and
 * blocked storage fall back to memory.
 */
import { accountsEnabled } from "@/lib/supabase/env";

const PREFIX = "consensa:call:";
const EVENT = "consensa:calls";
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

/** The database takes one change per call every 2 seconds, so quick changes are sent as the latest one. */
const PUSH_GAP_MS = 2100;
const lastPush = new Map<string, number>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();

function pushCall(slug: string, probability: number): void {
  const timer = pending.get(slug);
  if (timer !== undefined) clearTimeout(timer);
  const wait = (lastPush.get(slug) ?? -Infinity) + PUSH_GAP_MS - Date.now();
  const send = () => {
    pending.delete(slug);
    lastPush.set(slug, Date.now());
    void sendCall(slug, probability);
  };
  if (wait <= 0) send();
  else pending.set(slug, setTimeout(send, wait));
}

/** Sends one call to the server. Not signed in, or the question has closed: the call stays in this browser. */
async function sendCall(slug: string, probability: number): Promise<boolean> {
  try {
    const res = await fetch("/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, probability }) });
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
