/**
 * Credit lines for official publishers whose open data settles questions. Statistics Canada's Open Licence and the
 * Bank of Canada's terms ask for a source line, say adapted data is adapted, and forbid implying endorsement. We never
 * use their logos. Pure, so it is unit-tested.
 */
export type Publisher = "statcan" | "boc";

export function officialPublisher(url: string): Publisher | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === "statcan.gc.ca" || host.endsWith(".statcan.gc.ca")) return "statcan";
  if (host === "bankofcanada.ca" || host.endsWith(".bankofcanada.ca")) return "boc";
  return null;
}

/** A Statistics Canada table number from a table viewer link (pid=1410028701 → "14-10-0287-01"), when there is one. */
export function statcanTable(url: string): string | null {
  let pid: string | null;
  try {
    pid = new URL(url).searchParams.get("pid");
  } catch {
    return null;
  }
  const m = pid?.match(/^(\d{2})(\d{2})(\d{4})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}` : null;
}
