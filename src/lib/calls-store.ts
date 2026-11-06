/**
 * The preview keeps calls in this browser (localStorage) until accounts land in M2.
 * Every read and write is guarded: private windows and blocked storage fall back to memory.
 */
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
