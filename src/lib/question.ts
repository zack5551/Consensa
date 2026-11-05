import { z } from "zod";

export const provinces = ["BC", "AB", "PR", "ON", "QC", "AT"] as const;
export type Province = (typeof provinces)[number];

const bilingual = z.object({ en: z.string().min(1), fr: z.string().min(1) });
const percent = z.number().min(0).max(100);

export const questionSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  category: z.enum(["economy", "weather", "housing", "culture", "sports"]),
  question: bilingual,
  scored: z.boolean(),
  closesAt: z.iso.datetime(),
  forecasters: z.number().int().nonnegative(),
  /** Daily crowd probability (percent), oldest first. The last value is "now". */
  history: z.array(percent).min(2),
  provinces: z.record(z.enum(provinces), percent),
  events: z.array(z.object({ dayIndex: z.number().int().nonnegative(), label: bilingual })).default([]),
  why: z
    .object({ body: bilingual, sources: z.array(bilingual).min(1) })
    .optional(),
  resolution: z.object({
    source: z.object({ name: bilingual, url: z.url() }),
    rule: bilingual,
    resolvesAt: z.iso.datetime(),
  }),
});

export type Question = z.infer<typeof questionSchema>;

export function crowdNow(q: Question): number {
  return q.history[q.history.length - 1] ?? 0;
}
