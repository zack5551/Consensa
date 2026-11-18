/**
 * The browser half of the bot check. The server hands out a small proof-of-work puzzle (ALTCHA); this solves it in a
 * background worker on the person's own device, with no widget shown, and returns the answer to send along with the
 * request. Nothing leaves this site. A 204 from the challenge route means the check is off, so nothing loads and
 * nothing is solved. The altcha code is loaded only when a puzzle is actually needed.
 */
export type BotWidgetStrings = Record<string, string>;

let strings: { locale: string; values: BotWidgetStrings } | null = null;

/** The widget's own labels, from the dictionary. It never shows them while solving, but they are there for any state it can reach. */
export function setBotWidgetStrings(locale: string, values: BotWidgetStrings): void {
  strings = { locale, values };
}

type Widget = HTMLElement & { configure(config: Record<string, unknown>): Promise<void>; verify(options?: { minDuration?: number }): Promise<{ payload: string } | null> };
type Registry = { i18n: { get(l: string): Record<string, string> | undefined; set(l: string, v: Record<string, string>): void } };

/** The payload to send (header `x-altcha`, body field `altcha`), or null when the check is off or couldn't run. */
export async function solveBotCheck(): Promise<string | null> {
  try {
    const res = await fetch("/api/altcha/challenge", { cache: "no-store" });
    if (res.status !== 200) return null;
    const challenge: unknown = await res.json();
    await import("altcha");
    const registry = (globalThis as unknown as { $altcha?: Registry }).$altcha;
    const language = strings?.locale ?? "en";
    if (strings && registry) registry.i18n.set(language, { ...(registry.i18n.get("en") ?? {}), ...strings.values });
    const widget = document.createElement("altcha-widget") as Widget;
    widget.hidden = true;
    widget.inert = true;
    widget.setAttribute("aria-hidden", "true");
    document.body.appendChild(widget);
    try {
      // The widget mounts a moment after it is attached; its methods exist once it has.
      for (let i = 0; i < 100 && typeof widget.configure !== "function"; i++) await new Promise((resolve) => setTimeout(resolve, 10));
      await widget.configure({ challenge, auto: "off", display: "invisible", language, minDuration: 0, timeout: 15_000, hideFooter: true, hideLogo: true });
      return (await widget.verify({ minDuration: 0 }))?.payload ?? null;
    } finally {
      widget.remove();
    }
  } catch {
    return null;
  }
}

/** A solved token is good for 10 minutes on the server; replace ours well before that. */
const MAX_AGE_MS = 8 * 60_000;
let ready: Promise<string | null> | null = null;
let readyAt = 0;
let refresh: ReturnType<typeof setTimeout> | undefined;

function solveAhead(): Promise<string | null> {
  const p = solveBotCheck();
  ready = p;
  readyAt = Date.now();
  clearTimeout(refresh);
  refresh = setTimeout(() => {
    if (ready === p) solveAhead();
  }, MAX_AGE_MS);
  return p;
}

/** Starts solving in the background, once, so the first request doesn't wait for it. */
export function warmBotCheck(): void {
  if (!ready) solveAhead();
}

/** The ready token (each is used once), and starts solving the next one straight away. */
export function takeBotCheck(): Promise<string | null> {
  const token = ready && Date.now() - readyAt < MAX_AGE_MS ? ready : solveBotCheck();
  solveAhead();
  return token;
}
