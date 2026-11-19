import "server-only";
import { callsCountFrom, COUNTRY_HEADER } from "@/lib/call-origin";
import { callerIp, checkProxy } from "@/lib/server/proxy-check";

/**
 * The connection checks for linking (AEGIS rule 1): the moment of linking is the Canada proof for every later reply,
 * because a social reply carries no address. So, unlike a call, a VPN or proxy stops it. Reads the country header and
 * the local VPN database only; nothing about the connection is stored or logged.
 */
export async function connectionAllowed(headers: Pick<Headers, "get">): Promise<boolean> {
  if (!callsCountFrom(headers.get(COUNTRY_HEADER), Boolean(process.env.VERCEL))) return false;
  const { vpn } = await checkProxy(headers);
  return vpn !== true;
}

/** A rate-limit key for the caller's address, through callerIp() only. Off Vercel there is no address, so one shared key. */
export function addressKey(headers: Pick<Headers, "get">): string {
  return `ip:${callerIp(headers, Boolean(process.env.VERCEL)) ?? "local"}`;
}
