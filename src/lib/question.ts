import { z } from "zod";

export const provinces = ["BC", "AB", "PR", "ON", "QC", "AT"] as const;
export const categories = ["economy", "weather", "housing", "culture", "science", "sports"] as const;
export type Category = (typeof categories)[number];
export type Province = (typeof provinces)[number];

const bilingual = z.object({ en: z.string().min(1), fr: z.string().min(1) });
const percent = z.number().min(0).max(100);

export const questionSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  category: z.enum(categories),
  question: bilingual,
  scored: z.boolean(),
  closesAt: z.iso.datetime(),
  forecasters: z.number().int().nonnegative(),
  /** Daily crowd probability (percent), oldest first. The last value is "now". */
  history: z.array(percent).min(2),
  provinces: z.record(z.enum(provinces), percent),
  /** The crowd's chance among calls made in English vs French: one crowd, two languages. */
  languages: z.object({ en: percent, fr: percent }).optional(),
  /** Regions with too few real calls to show (privacy floor). Their tiles read "—" and the summary skips them. */
  hiddenProvinces: z.array(z.enum(provinces)).optional(),
  events: z.array(z.object({ dayIndex: z.number().int().nonnegative(), label: bilingual })).default([]),
  why: z
    .object({ body: bilingual, sources: z.array(bilingual).min(1) })
    .optional(),
  resolution: z.object({
    source: z.object({ name: bilingual, url: z.url() }),
    rule: bilingual,
    resolvesAt: z.iso.datetime(),
    /** Set once the official source has published. `disputed` means the result is under review. */
    result: z
      .object({ outcome: z.enum(["yes", "no"]), publishedAt: z.iso.datetime(), disputed: z.boolean().default(false) })
      .optional(),
  }),
});

export type Question = z.infer<typeof questionSchema>;

export function crowdNow(q: Question): number {
  return q.history[q.history.length - 1] ?? 0;
}

export const questionStates = ["open", "closingSoon", "closed", "resolved", "disputed"] as const;
export type QuestionState = (typeof questionStates)[number];

/** Questions closing within this window show the "closing soon" state. */
export const CLOSING_SOON_MS = 72 * 60 * 60 * 1000;

/**
 * Where a question is in its life: open → closing soon → closed (waiting for the official result) → resolved.
 * A published result that's under review is "disputed" and isn't scored until the review ends.
 */
export function questionState(q: Question, now: Date): QuestionState {
  const result = q.resolution.result;
  if (result) return result.disputed ? "disputed" : "resolved";
  const msLeft = Date.parse(q.closesAt) - now.getTime();
  if (msLeft <= 0) return "closed";
  if (msLeft <= CLOSING_SOON_MS) return "closingSoon";
  return "open";
}

export function isOpen(state: QuestionState): boolean {
  return state === "open" || state === "closingSoon";
}

/** Highest and lowest regions, for the province split's text summary. */
/** Highest and lowest region among those shown. Null when fewer than two regions can be shown. */
export function provinceExtremes(values: Record<Province, number>, hidden: readonly Province[] = []): { high: Province; low: Province } | null {
  const sorted = provinces.filter((p) => !hidden.includes(p)).sort((a, b) => values[b] - values[a]);
  const high = sorted[0];
  const low = sorted[sorted.length - 1];
  return high !== undefined && low !== undefined && high !== low ? { high, low } : null;
}

/** Whole-point change in the crowd's chance over the last `days` days. */
export function crowdChange(q: Question, days = 7): number {
  const now = crowdNow(q);
  const then = q.history[Math.max(0, q.history.length - 1 - days)] ?? now;
  return now - then;
}

/**
 * How the crowd moved over the last week, for the line under "Canada says". Null when the history is shorter than a
 * week, so a new question never claims a weekly move it hasn't had.
 */
export function weekMove(q: Question): { direction: "up" | "down" | "flat"; points: number } | null {
  if (q.history.length < 8) return null;
  const change = crowdChange(q, 7);
  return { direction: change > 0 ? "up" : change < 0 ? "down" : "flat", points: Math.abs(change) };
}

/** The crowd's chance when calls closed, scored against the result. Null until a non-disputed result exists. */
export function crowdBrier(q: Question): number | null {
  const r = q.resolution.result;
  if (!r || r.disputed || !q.scored) return null;
  const p = crowdNow(q) / 100;
  return (p - (r.outcome === "yes" ? 1 : 0)) ** 2;
}

/** Whether the crowd's number at close leaned toward the answer. Null until a non-disputed result on a scored question. */
export function crowdVerdict(q: Question): "right" | "wrong" | "split" | null {
  if (crowdBrier(q) === null) return null;
  const now = crowdNow(q);
  if (now === 50) return "split";
  return (now > 50) === (q.resolution.result?.outcome === "yes") ? "right" : "wrong";
}

/**
 * The crowd's record on this question's topic: how many resolved, scored questions it leaned the right way on. Null
 * below `min` results, so a topic with one or two results never reads as a track record.
 */
export function topicRecord(q: Question, all: readonly Question[], min = 3): { right: number; total: number } | null {
  const verdicts = all.filter((o) => o.category === q.category).map(crowdVerdict).filter((v) => v !== null);
  if (verdicts.length < min) return null;
  return { right: verdicts.filter((v) => v === "right").length, total: verdicts.length };
}

/**
 * Up to `n` open questions to call next, after this one: same topic first, then the rest, each group by most called.
 * Never this question and never a closed one, so every link leads to a call that can still be made.
 */
export function nextUp(q: Question, all: readonly Question[], now: Date, n = 3): Question[] {
  const open = all.filter((o) => o.slug !== q.slug && isOpen(questionState(o, now)));
  const byCalls = (a: Question, b: Question) => b.forecasters - a.forecasters;
  const same = open.filter((o) => o.category === q.category).sort(byCalls);
  const rest = open.filter((o) => o.category !== q.category).sort(byCalls);
  return [...same, ...rest].slice(0, n);
}

/** The crowd's public record across resolved, scored questions. */
export function crowdRecord(qs: readonly Question[]): { resolved: number; meanBrier: number | null; rightSide: number | null } {
  const scored = qs.flatMap((q) => {
    const b = crowdBrier(q);
    const r = q.resolution.result;
    return b === null || !r ? [] : [{ b, right: crowdNow(q) !== 50 && (crowdNow(q) > 50) === (r.outcome === "yes") }];
  });
  if (scored.length === 0) return { resolved: 0, meanBrier: null, rightSide: null };
  return {
    resolved: scored.length,
    meanBrier: scored.reduce((s, x) => s + x.b, 0) / scored.length,
    rightSide: Math.round((scored.filter((x) => x.right).length / scored.length) * 100),
  };
}
