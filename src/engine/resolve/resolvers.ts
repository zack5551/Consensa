/**
 * Auto-resolution: read the official source and say YES, NO, or "not yet".
 *
 * Each resolver is a pure function of (spec, http, now) and validates the source's response with Zod, so a changed
 * API shape becomes an `error` read, never a wrong answer.
 * - Bank of Canada Valet: GET /valet/observations/V39079/json → { observations: [{ d, V39079: { v } }] }
 *   (checked against the live API on 2026-11-11: a change shows from the business day after the decision).
 * - Statistics Canada WDS: POST getDataFromVectorsAndLatestNPeriods → [{ status, object: { vectorDataPoint: [{ refPer, value, releaseTime }] } }]
 *   (from the WDS user guide, 2026-11-06).
 * - ECCC GeoMet OGC API: GET /collections/climate-daily/items → GeoJSON features with the element in properties.
 *   Not yet checked live; the first real read confirms it.
 */
import { z } from "zod";
import type { FetchLike } from "@/engine/sources/feed";

/** What resolvers need from the network. `httpFrom(fetch)` builds one from the platform fetch. */
export interface Http {
  get: FetchLike;
  post(url: string, body: unknown): ReturnType<FetchLike>;
}

export function httpFrom(fetchImpl: typeof fetch): Http {
  const headers = { "user-agent": "ConsensaPulse/0.1", accept: "application/json" };
  return {
    get: (url) => fetchImpl(url, { headers, signal: AbortSignal.timeout(15_000) }),
    post: (url, body) =>
      fetchImpl(url, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) }),
  };
}
import type { Comparator, Resolver, ResolverRead } from "@/engine/types";

export function compare(value: number, comparator: Comparator, threshold: number): boolean {
  switch (comparator) {
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;

// ─── Bank of Canada ───────────────────────────────────────────────────────────

export const VALET_SERIES = "V39079";
const valetSchema = z.object({
  observations: z.array(z.object({ d: z.iso.date(), [VALET_SERIES]: z.object({ v: z.string() }).optional() })),
});

export function valetUrl(decisionDate: string): string {
  const start = new Date(Date.parse(`${decisionDate}T00:00:00Z`) - 21 * 86_400_000).toISOString().slice(0, 10);
  const end = new Date(Date.parse(`${decisionDate}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  return `https://www.bankofcanada.ca/valet/observations/${VALET_SERIES}/json?start_date=${start}&end_date=${end}`;
}

async function bocPolicyRate(r: Extract<Resolver, { kind: "boc-policy-rate" }>, http: Http, now: Date): Promise<ResolverRead> {
  // The announcement is at 9:45 ET, and Valet shows the new target from the next business day: on 2026-10-28 (a
  // 25-point hike) the series read 2.25 on Oct 28 and 2.50 on Oct 29. So compare the decision date itself with the
  // first day after it. Wait until the decision day is over.
  if (now.getTime() < Date.parse(`${r.decisionDate}T23:59:59Z`)) return { status: "pending", reason: "decision date not reached" };
  const url = valetUrl(r.decisionDate);
  const res = await http.get(url);
  if (!res.ok) return { status: "error", reason: `Valet HTTP ${res.status}` };
  const parsed = valetSchema.safeParse(await res.json());
  if (!parsed.success) return { status: "error", reason: "Valet response shape changed" };

  const points = parsed.data.observations
    .map((o) => ({ d: o.d, v: Number(o[VALET_SERIES]?.v) }))
    .filter((p) => Number.isFinite(p.v))
    .sort((a, b) => a.d.localeCompare(b.d));
  const before = points.filter((p) => p.d <= r.decisionDate).at(-1);
  const after = points.find((p) => p.d > r.decisionDate);
  if (!before || !after) return { status: "pending", reason: "Valet has no observation on both sides of the decision yet" };

  const change = round(after.v - before.v);
  const moved = change < 0 ? "cut" : change > 0 ? "hike" : "hold";
  return {
    status: "answer",
    outcome: moved === r.direction ? "yes" : "no",
    observed: `${before.v.toFixed(2)}% → ${after.v.toFixed(2)}% (${after.d})`,
    evidenceUrl: url,
    // Rates move in steps of at least 0.25, so a hold is as clear an answer as a move: never "on the line".
    margin: Math.abs(change) || 0.25,
  };
}

// ─── Statistics Canada ────────────────────────────────────────────────────────

export const WDS_URL = "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods";
const wdsSchema = z.array(
  z.object({
    status: z.string(),
    object: z
      .object({
        vectorId: z.number(),
        vectorDataPoint: z.array(z.object({ refPer: z.string(), value: z.union([z.string(), z.number()]).nullable(), releaseTime: z.string().optional() })),
      })
      .optional(),
  }),
);

async function statcanVector(r: Extract<Resolver, { kind: "statcan-vector" }>, http: Http): Promise<ResolverRead> {
  const res = await http.post(WDS_URL, [{ vectorId: r.vectorId, latestN: 6 }]);
  if (!res.ok) return { status: "error", reason: `WDS HTTP ${res.status}` };
  const parsed = wdsSchema.safeParse(await res.json());
  const first = parsed.success ? parsed.data[0] : undefined;
  if (!first || first.status !== "SUCCESS" || !first.object) return { status: "error", reason: "WDS response shape changed or failed" };

  const point = first.object.vectorDataPoint.find((p) => p.refPer.startsWith(r.refPeriod));
  if (!point || point.value === null || point.value === "") return { status: "pending", reason: `${r.refPeriod} not published yet` };
  const value = Number(point.value);
  if (!Number.isFinite(value)) return { status: "error", reason: "WDS value is not a number" };
  return {
    status: "answer",
    outcome: compare(value, r.comparator, r.threshold) ? "yes" : "no",
    observed: `${value}${r.unit === "%" ? "%" : ` ${r.unit}`} for ${r.refPeriod}${point.releaseTime ? `, released ${point.releaseTime}` : ""}`,
    evidenceUrl: `https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?vectorId=${r.vectorId}`,
    margin: round(Math.abs(value - r.threshold)),
  };
}

// ─── Environment and Climate Change Canada ───────────────────────────────────

const ecccSchema = z.object({
  features: z.array(z.object({ properties: z.record(z.string(), z.unknown()) })),
});

export function ecccUrl(r: Extract<Resolver, { kind: "eccc-daily-climate" }>): string {
  const q = new URLSearchParams({
    CLIMATE_IDENTIFIER: r.climateId,
    datetime: `${r.from} 00:00:00/${r.to} 00:00:00`,
    sortby: "LOCAL_DATE",
    limit: "400",
    f: "json",
  });
  return `https://api.weather.gc.ca/collections/climate-daily/items?${q.toString()}`;
}

/** ECCC posts daily data with a lag. Wait this long after the window ends before reading it. */
export const ECCC_LAG_MS = 36 * 60 * 60 * 1000;

async function ecccDaily(r: Extract<Resolver, { kind: "eccc-daily-climate" }>, http: Http, now: Date): Promise<ResolverRead> {
  if (now.getTime() < Date.parse(`${r.to}T23:59:59Z`) + ECCC_LAG_MS) return { status: "pending", reason: "window not closed, or data not posted yet" };
  const url = ecccUrl(r);
  const res = await http.get(url);
  if (!res.ok) return { status: "error", reason: `ECCC HTTP ${res.status}` };
  const parsed = ecccSchema.safeParse(await res.json());
  if (!parsed.success) return { status: "error", reason: "ECCC response shape changed" };

  const days = parsed.data.features.map((f) => f.properties);
  const expected = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000) + 1;
  const values = days.map((p) => p[r.element]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  // Missing days could hide the deciding snowfall. Don't guess: hand it to an editor.
  if (values.length < expected) return { status: "error", reason: `ECCC has ${values.length} of ${expected} days` };

  const total = r.aggregate === "sum" ? values.reduce((a, b) => a + b, 0) : r.aggregate === "max" ? Math.max(...values) : Math.min(...values);
  return {
    status: "answer",
    outcome: compare(total, r.comparator, r.threshold) ? "yes" : "no",
    observed: `${r.aggregate} of ${r.element} at ${r.climateId}, ${r.from} to ${r.to}: ${round(total)}`,
    evidenceUrl: url,
    margin: round(Math.abs(total - r.threshold)),
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/** Never throws: a network or parsing failure is an `error` read that the next cycle retries. */
export async function readResolver(r: Resolver, http: Http, now: Date): Promise<ResolverRead> {
  try {
    switch (r.kind) {
      case "boc-policy-rate":
        return await bocPolicyRate(r, http, now);
      case "statcan-vector":
        return await statcanVector(r, http);
      case "eccc-daily-climate":
        return await ecccDaily(r, http, now);
      case "manual":
        return { status: "pending", reason: `editor checks: ${r.check}` };
    }
  } catch (err) {
    return { status: "error", reason: err instanceof Error ? err.message : String(err) };
  }
}
