import { z } from "zod";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { categories, questionState, type Question } from "@/lib/question";
import { regions, type Region } from "@/lib/regions";

/**
 * Resolved sample questions for the record, leaderboard and province screens, until the database lands.
 * Outcomes and numbers are illustrative, not real results. Each one names the official source it would resolve from.
 */
const bilingual = z.object({ en: z.string().min(1), fr: z.string().min(1) });
const percent = z.number().int().min(1).max(99);

export const resultSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  category: z.enum(categories),
  question: bilingual,
  source: bilingual,
  resolvedAt: z.iso.date(),
  outcome: z.union([z.literal(0), z.literal(1)]),
  /** Each region's final crowd forecast and the number of forecasters behind it. */
  regions: z.record(z.enum(regions), z.object({ percent, forecasters: z.number().int().nonnegative() })),
});

export type Result = z.infer<typeof resultSchema> & { national: number; forecasters: number };

type Cells = [number, number, number, number, number, number];

/** Region cells in BC, AB, PR, ON, QC, AT order: [percent, forecasters]. */
function cells(percents: Cells, counts: Cells): Record<Region, { percent: number; forecasters: number }> {
  return Object.fromEntries(regions.map((r, i) => [r, { percent: percents[i]!, forecasters: counts[i]! }])) as Record<Region, { percent: number; forecasters: number }>;
}

/** A typical national mix of forecasters, scaled. */
function mix(total: number): Cells {
  const share: Cells = [0.14, 0.12, 0.07, 0.38, 0.23, 0.06];
  return share.map((s) => Math.round(s * total)) as Cells;
}

const raw = [
  {
    slug: "boc-hold-oct-2026",
    category: "economy",
    question: { en: "Will the Bank of Canada hold its policy rate at its October decision?", fr: "La Banque du Canada maintiendra-t-elle son taux directeur à sa décision d’octobre?" },
    source: { en: "Bank of Canada", fr: "Banque du Canada" },
    resolvedAt: "2026-10-28",
    outcome: 1,
    regions: cells([71, 74, 72, 69, 66, 70], mix(16200)),
  },
  {
    slug: "cpi-aug-2026",
    category: "economy",
    question: { en: "Will August's CPI inflation come in at 2.0% or lower?", fr: "L’inflation de l’IPC d’août sera-t-elle de 2,0 % ou moins?" },
    source: { en: "Statistics Canada · Consumer Price Index", fr: "Statistique Canada · Indice des prix à la consommation" },
    resolvedAt: "2026-09-16",
    outcome: 0,
    regions: cells([44, 39, 41, 46, 52, 43], mix(9800)),
  },
  {
    slug: "jobless-sept-2026",
    category: "economy",
    question: { en: "Will September's unemployment rate be 7.0% or higher?", fr: "Le taux de chômage de septembre sera-t-il de 7,0 % ou plus?" },
    source: { en: "Statistics Canada · Labour Force Survey", fr: "Statistique Canada · Enquête sur la population active" },
    resolvedAt: "2026-10-09",
    outcome: 1,
    regions: cells([58, 55, 53, 61, 57, 63], mix(11400)),
  },
  {
    slug: "gdp-q2-2026",
    category: "economy",
    question: { en: "Will Statistics Canada report positive GDP growth for the second quarter?", fr: "Statistique Canada annoncera-t-elle une croissance positive du PIB au deuxième trimestre?" },
    source: { en: "Statistics Canada · GDP", fr: "Statistique Canada · PIB" },
    resolvedAt: "2026-08-28",
    outcome: 1,
    regions: cells([62, 66, 60, 57, 54, 59], mix(7200)),
  },
  {
    slug: "starts-aug-2026",
    category: "housing",
    question: { en: "Will CMHC report more than 250,000 annualized housing starts for August?", fr: "La SCHL annoncera-t-elle plus de 250 000 mises en chantier annualisées en août?" },
    source: { en: "CMHC · Housing starts", fr: "SCHL · Mises en chantier" },
    resolvedAt: "2026-09-15",
    outcome: 0,
    regions: cells([47, 52, 49, 44, 41, 46], mix(5400)),
  },
  {
    slug: "home-sales-sept-2026",
    category: "housing",
    question: { en: "Will CREA report national home sales up from August in September?", fr: "L’ACI annoncera-t-elle une hausse des ventes de maisons en septembre par rapport à août?" },
    source: { en: "CREA · Monthly statistics", fr: "ACI · Statistiques mensuelles" },
    resolvedAt: "2026-10-15",
    outcome: 1,
    regions: cells([55, 51, 50, 58, 60, 53], mix(6100)),
  },
  {
    slug: "yvr-rain-oct-2026",
    category: "weather",
    question: { en: "Will Vancouver get more than 150 mm of rain in October?", fr: "Vancouver recevra-t-elle plus de 150 mm de pluie en octobre?" },
    source: { en: "Environment Canada · Vancouver Intl.", fr: "Environnement Canada · Vancouver Intl." },
    resolvedAt: "2026-11-01",
    outcome: 1,
    regions: cells([68, 57, 55, 59, 56, 58], [1840, 420, 230, 1310, 640, 4]),
  },
  {
    slug: "yul-snow-oct-2026",
    category: "weather",
    question: { en: "Will Montréal-Trudeau record its first snowfall before Nov. 1?", fr: "Montréal-Trudeau enregistrera-t-il sa première neige avant le 1er novembre?" },
    source: { en: "Environment Canada · Montréal-Trudeau", fr: "Environnement Canada · Montréal-Trudeau" },
    resolvedAt: "2026-11-01",
    outcome: 0,
    regions: cells([38, 41, 44, 36, 29, 40], mix(8300)),
  },
  {
    slug: "halifax-warm-sept-2026",
    category: "weather",
    question: { en: "Will Halifax have a warmer-than-normal September?", fr: "Halifax connaîtra-t-elle un mois de septembre plus chaud que la normale?" },
    source: { en: "Environment Canada · Halifax Stanfield", fr: "Environnement Canada · Halifax Stanfield" },
    resolvedAt: "2026-10-02",
    outcome: 1,
    regions: cells([61, 60, 58, 63, 62, 72], [3, 2, 1, 880, 410, 1260]),
  },
  {
    slug: "calgary-25c-sept-2026",
    category: "weather",
    question: { en: "Will Calgary reach 25°C after Sept. 15?", fr: "Calgary atteindra-t-elle 25 °C après le 15 septembre?" },
    source: { en: "Environment Canada · Calgary Intl.", fr: "Environnement Canada · Calgary Intl." },
    resolvedAt: "2026-10-01",
    outcome: 1,
    regions: cells([52, 64, 57, 49, 47, 50], [610, 2210, 540, 900, 380, 120]),
  },
  {
    slug: "tiff-canadian-2026",
    category: "culture",
    question: { en: "Will a Canadian film win TIFF's People's Choice Award?", fr: "Un film canadien remportera-t-il le Prix du public du TIFF?" },
    source: { en: "Toronto International Film Festival", fr: "Festival international du film de Toronto" },
    resolvedAt: "2026-09-20",
    outcome: 0,
    regions: cells([31, 27, 29, 36, 33, 30], mix(4700)),
  },
  {
    slug: "polaris-french-2026",
    category: "culture",
    question: { en: "Will a French-language album win the 2026 Polaris Music Prize?", fr: "Un album en français remportera-t-il le prix de musique Polaris 2026?" },
    source: { en: "Polaris Music Prize", fr: "Prix de musique Polaris" },
    resolvedAt: "2026-09-22",
    outcome: 1,
    regions: cells([28, 24, 26, 30, 47, 33], mix(3900)),
  },
  {
    slug: "giller-shortlist-2026",
    category: "culture",
    question: { en: "Will a debut novel make the 2026 Giller Prize shortlist?", fr: "Un premier roman figurera-t-il parmi les finalistes du prix Giller 2026?" },
    source: { en: "Scotiabank Giller Prize", fr: "Prix Giller Banque Scotia" },
    resolvedAt: "2026-10-06",
    outcome: 1,
    regions: cells([54, 49, 51, 57, 48, 55], mix(2600)),
  },
  {
    slug: "cpi-sept-shelter-2026",
    category: "economy",
    question: { en: "Will shelter inflation in September's CPI be below 4%?", fr: "L’inflation du logement dans l’IPC de septembre sera-t-elle sous les 4 %?" },
    source: { en: "Statistics Canada · Consumer Price Index", fr: "Statistique Canada · Indice des prix à la consommation" },
    resolvedAt: "2026-10-21",
    outcome: 1,
    regions: cells([49, 53, 55, 47, 58, 52], mix(8800)),
  },
] as const;

function withTotals(r: z.infer<typeof resultSchema>): Result {
  const cellsList = regions.map((g) => r.regions[g]);
  const forecasters = cellsList.reduce((s, c) => s + c.forecasters, 0);
  const national = forecasters ? Math.round(cellsList.reduce((s, c) => s + c.percent * c.forecasters, 0) / forecasters) : 50;
  return { ...r, national, forecasters };
}

/**
 * Resolved questions from the question board join the results too, so a result links to its full question page.
 * Their region counts follow the typical national mix.
 */
function fromQuestion(q: Question): z.infer<typeof resultSchema> | null {
  const result = q.resolution.result;
  if (!result || questionState(q, SAMPLE_NOW) !== "resolved" || !q.scored) return null;
  const counts = mix(q.forecasters);
  const percents = regions.map((r) => Math.min(99, Math.max(1, Math.round(q.provinces[r])))) as Cells;
  return {
    slug: q.slug,
    category: q.category,
    question: q.question,
    source: q.resolution.source.name,
    resolvedAt: result.publishedAt.slice(0, 10),
    outcome: result.outcome === "yes" ? 1 : 0,
    regions: cells(percents, counts),
  };
}

/** Validated at import so a bad sample fails the build, not the page. Newest first. */
export const sampleResults: readonly Result[] = [...raw, ...sampleQuestions.flatMap((q) => fromQuestion(q) ?? [])]
  .map((r) => withTotals(resultSchema.parse(r)))
  .sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt) || a.slug.localeCompare(b.slug));

export function getResult(slug: string): Result | undefined {
  return sampleResults.find((r) => r.slug === slug);
}
