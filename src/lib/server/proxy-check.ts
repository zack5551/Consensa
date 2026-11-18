import "server-only";
import { existsSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";

/** `true` came through a VPN or proxy, `false` did not, "unknown" could not be checked. */
export type VpnFlag = boolean | "unknown";

/** IP2Proxy's proxy types that mean "not a direct connection": VPN, Tor, public and web proxies, hosting, residential, privacy relays. */
const PROXY_TYPES = new Set(["VPN", "TOR", "PUB", "WEB", "DCH", "RES", "CPN", "EPN"]);

/** Decides the flag from the database's proxy type. "-" is "not a proxy". Anything else (an error message, search robots) is unknown. */
export function flagFromProxyType(type: string | null | undefined): VpnFlag {
  if (type === "-") return false;
  return typeof type === "string" && PROXY_TYPES.has(type) ? true : "unknown";
}

/** The caller's address from Vercel's headers: `x-real-ip`, else the first `x-forwarded-for` entry. Off Vercel there is none. */
export function callerIp(headers: Pick<Headers, "get">, onVercel: boolean): string | null {
  if (!onVercel) return null;
  const ip = (headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim();
  return isIP(ip) ? ip : null;
}

type Reader = { getProxyTypeAsync(ip: string): Promise<string> };
let reader: Promise<Reader | null> | undefined;

/** Opens the local database once. A missing file (no token at build time) or a bad one means no reader. */
function openReader(): Promise<Reader | null> {
  reader ??= (async () => {
    const bin = join(process.cwd(), "data", "ip2proxy", "IP2PROXY-LITE-PX2.BIN");
    if (!existsSync(bin)) return null;
    const { IP2Proxy } = await import("ip2proxy-nodejs");
    const db = new IP2Proxy();
    return db.open(bin) === 0 ? db : null;
  })().catch(() => null);
  return reader;
}

// Open the database when the server starts, so the first call is not slow (calls wait only 150 ms for the check).
void openReader();

/**
 * Is this call coming through a VPN or proxy? The lookup reads a database file on this server, so the address goes
 * nowhere. It lives in a local variable here: never logged, stored, returned or sent.
 */
export async function checkProxy(headers: Pick<Headers, "get">): Promise<{ vpn: VpnFlag }> {
  const ip = callerIp(headers, Boolean(process.env.VERCEL));
  if (!ip) return { vpn: "unknown" };
  try {
    const db = await openReader();
    return { vpn: db ? flagFromProxyType(await db.getProxyTypeAsync(ip)) : "unknown" };
  } catch {
    return { vpn: "unknown" };
  }
}
