// Runs before `next build`. Downloads the free IP2Proxy LITE PX2 database (CC BY-SA 4.0) into data/ip2proxy/ so the
// server can tell, locally, whether a call came through a VPN or proxy. No address ever leaves Canada: the lookup
// reads this file on our own server. Needs the server-only env IP2PROXY_TOKEN. Without it, or on any failure, it
// prints one line and exits 0: the app then reports "unknown" and nothing breaks. The token is never printed.
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const dir = new URL("../data/ip2proxy/", import.meta.url);
const target = new URL("IP2PROXY-LITE-PX2.BIN", dir);
const FRESH_MS = 20 * 24 * 60 * 60 * 1000; // the database changes monthly and downloads are limited

/** Pulls the .BIN file out of IP2Location's zip. Reads the central directory, so it needs no unzip program. */
export function extractBin(zip) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = zip.readUInt16LE(eocd + 10); n > 0; n--) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("bad zip directory");
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const next = p + 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
    if (/\.bin$/i.test(name)) {
      const local = zip.readUInt32LE(p + 42);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error("unsupported zip method");
    }
    p = next;
  }
  throw new Error("no .BIN in the zip");
}

async function main() {
  const token = process.env.IP2PROXY_TOKEN;
  if (!token) return console.warn("ip2proxy: no IP2PROXY_TOKEN; VPN checks will report unknown.");
  if (existsSync(target) && Date.now() - statSync(target).mtimeMs < FRESH_MS) return console.warn("ip2proxy: database is recent; keeping it.");
  try {
    const res = await fetch(`https://www.ip2location.com/download/?token=${encodeURIComponent(token)}&file=PX2LITEBINIPV6`, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`download answered ${res.status}`);
    const bin = extractBin(Buffer.from(await res.arrayBuffer()));
    if (bin.length < 1_000_000) throw new Error("database looks too small");
    mkdirSync(dir, { recursive: true });
    const tmp = new URL("download.tmp", dir);
    writeFileSync(tmp, bin);
    renameSync(tmp, target);
    console.warn("ip2proxy: database ready.");
  } catch (e) {
    console.warn(`ip2proxy: could not fetch the database (${e instanceof Error ? e.message : "error"}); VPN checks will report unknown.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
