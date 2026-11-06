/**
 * PULSE, the question engine: shared types.
 *
 * The engine turns what Canada is talking about into draft questions, and drafts into published questions only
 * after an editor approves them. Flow: signals → stories → candidates → drafts → review → published → resolved.
 *
 * Everything here is framework-free and validated with Zod, because every input comes from outside (feeds, APIs,
 * the model). Editorial fields match `questionSchema` in `src/lib/question.ts` so an approved draft drops straight
 * into the question page.
 */
import { z } from "zod";
import { categories } from "@/lib/question";

export const bilingual = z.object({ en: z.string().min(1), fr: z.string().min(1) });
export type Bilingual = z.infer<typeof bilingual>;

// ─── Sources and signals ──────────────────────────────────────────────────────

/** news: newsrooms. official: government and agency releases. trend: what people search for. calendar: dated releases. */
export const sourceKinds = ["news", "official", "trend", "calendar"] as const;
export type SourceKind = (typeof sourceKinds)[number];

export const sourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  kind: z.enum(sourceKinds),
  lang: z.enum(["en", "fr"]),
  url: z.url(),
  format: z.enum(["rss", "atom", "fixture"]),
  /** How much one item from this source counts toward a story's heat. Official sources weigh more. */
  weight: z.number().min(0).max(3),
  /** Set once someone has fetched the feed from production and checked the shape. */
  verified: z.boolean(),
});
export type Source = z.infer<typeof sourceSchema>;

/** One item from one source: a headline, a release, a trending search. */
export const signalSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  kind: z.enum(sourceKinds),
  lang: z.enum(["en", "fr"]),
  title: z.string().min(1),
  summary: z.string().default(""),
  url: z.url(),
  publishedAt: z.iso.datetime(),
  weight: z.number().min(0).max(3),
});
export type Signal = z.infer<typeof signalSchema>;

/** Signals about the same thing, grouped. A story is what a question gets written from. */
export interface Story {
  id: string;
  signals: Signal[];
  /** Most informative headline, used as the story's label in the review queue. */
  headline: string;
  langs: Array<"en" | "fr">;
  firstSeenAt: string;
  lastSeenAt: string;
  /** 0–100. How hot and how fresh the story is right now. See `score.ts`. */
  heat: number;
  /** Category guessed from keywords, before the model weighs in. */
  categoryHint: (typeof categories)[number] | null;
}

// ─── Resolvers ────────────────────────────────────────────────────────────────

export const comparators = [">", ">=", "<", "<="] as const;
export type Comparator = (typeof comparators)[number];

/**
 * How a question settles. Machine-readable resolvers run automatically; `manual` goes to an editor.
 * Every resolver names the official source the rule text cites.
 */
export const resolverSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("boc-policy-rate"),
    /** Scheduled announcement date (YYYY-MM-DD, Ottawa). */
    decisionDate: z.iso.date(),
    /** YES if the target for the overnight rate moves this way on that date. */
    direction: z.enum(["cut", "hike", "hold"]),
  }),
  z.object({
    kind: z.literal("statcan-vector"),
    /** A Statistics Canada vector, e.g. 2062815 (unemployment rate, Canada, SA). */
    vectorId: z.number().int().positive(),
    /** Reference month (YYYY-MM). */
    refPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    comparator: z.enum(comparators),
    threshold: z.number(),
    unit: z.string().min(1),
  }),
  z.object({
    kind: z.literal("eccc-daily-climate"),
    /** ECCC climate identifier, e.g. 6158731 for Toronto Pearson. */
    climateId: z.string().regex(/^[0-9A-Z]{7}$/),
    element: z.enum(["TOTAL_SNOW", "TOTAL_PRECIPITATION", "MAX_TEMPERATURE", "MIN_TEMPERATURE"]),
    aggregate: z.enum(["sum", "max", "min"]),
    from: z.iso.date(),
    to: z.iso.date(),
    comparator: z.enum(comparators),
    threshold: z.number(),
  }),
  z.object({
    kind: z.literal("manual"),
    /** What the editor checks, in one line, e.g. "Winner announced on scotiabankgillerprize.ca". */
    check: z.string().min(1),
  }),
]);
export type Resolver = z.infer<typeof resolverSchema>;

// ─── Drafts ───────────────────────────────────────────────────────────────────

/** What a drafter returns for one story. Editorial fields mirror `questionSchema`. */
export const draftSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
  category: z.enum(categories),
  question: bilingual,
  /** false = poll (sports at launch). Polls never count toward anyone's record. */
  scored: z.boolean(),
  closesAt: z.iso.datetime(),
  resolution: z.object({
    source: z.object({ name: bilingual, url: z.url() }),
    rule: bilingual,
    resolvesAt: z.iso.datetime(),
  }),
  resolver: resolverSchema,
  /** One line for the editor: why this is worth asking now. Never shown to forecasters. */
  editorNote: z.string().min(1),
});
export type Draft = z.infer<typeof draftSchema>;

// ─── Checks ───────────────────────────────────────────────────────────────────

/** block: never shown to anyone. review: an editor must look at this flag. */
export type Severity = "block" | "review";

export interface Flag {
  code: string;
  severity: Severity;
  /** For the editor, in plain English. */
  detail: string;
}

// ─── Review queue ─────────────────────────────────────────────────────────────

export const reviewStatuses = ["pending", "approved", "rejected", "needsChanges", "published", "autoRejected"] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];

export interface ReviewEvent {
  at: string;
  /** "engine" for automatic steps, otherwise the editor's id. */
  actor: string;
  from: ReviewStatus | null;
  to: ReviewStatus;
  note?: string;
}

export interface QueueItem {
  id: string;
  storyId: string;
  draft: Draft;
  flags: Flag[];
  /** Signal URLs the draft was written from, for the editor and the public log. */
  provenance: string[];
  /** 0–100, from story heat and resolvability. The queue is sorted by this. */
  priority: number;
  status: ReviewStatus;
  history: ReviewEvent[];
  /** Which drafter wrote it (model id or "mock"), for the AI disclosure and audits. */
  drafter: string;
  createdAt: string;
}

// ─── Resolution ───────────────────────────────────────────────────────────────

export type ResolverRead =
  | { status: "pending"; reason: string }
  | {
      status: "answer";
      outcome: "yes" | "no";
      /** The number or fact read from the source, as text for the public log. */
      observed: string;
      evidenceUrl: string;
      /** How close the reading sat to the threshold, in the threshold's units. 0 = exactly on it. */
      margin: number | null;
    }
  | { status: "error"; reason: string };

export interface ResolutionRecord {
  slug: string;
  reads: Array<{ at: string; read: ResolverRead }>;
  state: "waiting" | "confirming" | "resolved" | "needsEditor";
  outcome?: "yes" | "no";
  resolvedAt?: string;
  /** Set by an editor when a published result is under review; it isn't scored until the review ends. */
  disputed?: boolean;
  /** Who settled it: "engine" for auto-resolution, otherwise the editor's id. */
  resolvedBy?: string;
}
