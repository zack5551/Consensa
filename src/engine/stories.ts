/**
 * Signals → stories, and how hot each story is.
 *
 * Clustering is greedy single-pass over signals sorted by time: a signal joins the story whose token set it
 * overlaps most, if that overlap clears the threshold and the story is still inside the window. It's O(n·k) for
 * n signals and k open stories, which is plenty for a few thousand headlines a cycle. Cross-language matching
 * works on shared names and numbers, plus a small FR→EN alias table for the words that carry Canadian news, so
 * "La Banque du Canada baisse son taux" joins "Bank of Canada cuts rate".
 */
import { createHash } from "node:crypto";
import type { Category } from "@/lib/question";
import type { Signal, Story } from "@/engine/types";
import { overlap, tokens } from "@/engine/text";

/** FR → EN for the terms that carry Canadian stories, so a Radio-Canada headline can join a CBC story. */
const ALIASES: Record<string, string> = {
  banque: "bank", taux: "rate", directeur: "policy", baisse: "cut", hausse: "hike", inflation: "inflation",
  chomage: "unemployment", emploi: "job", emplois: "job", logement: "housing", maisons: "home", maison: "home",
  prix: "price", neige: "snow", tempete: "storm", pluie: "rain", chaleur: "heat", canicule: "heatwave",
  gouverneur: "governor", statistique: "statistic", environnement: "environment", federal: "federal",
  ottawa: "ottawa", quebec: "quebec", montreal: "montreal", toronto: "toronto", vancouver: "vancouver",
  calgary: "calgary", edmonton: "edmonton", halifax: "halifax", winnipeg: "winnipeg",
  baisser: "cut", baissera: "cut", baisserait: "cut", hausser: "hike", grimpe: "rise", augmente: "rise",
  neiger: "snow", snowfall: "snow", snowstorm: "snow", ontarien: "ontario", ontarienne: "ontario", quebecois: "quebec",
  janvier: "january", fevrier: "february", avril: "april", juin: "june", juillet: "july", aout: "august",
  septembre: "september", octobre: "october", novembre: "november", decembre: "december", sondage: "survey",
  ventes: "sale", vente: "sale", loyers: "rent", loyer: "rent", essence: "gas", lancement: "launch",
  spatiale: "space", fusee: "rocket", album: "album", film: "film", recolte: "harvest", greve: "strike",
  ouverture: "opening", ligne: "line", tramway: "lrt", metro: "subway",
};

/** Words in nearly every Canadian headline. They say nothing about which story it is. */
const UBIQUITOUS = new Set(["canada", "canadian", "canadien", "canadienne", "pourrait", "could", "whether", "again", "exemple", "sample"]);

function aliased(text: string): string[] {
  return tokens(text).map((t) => ALIASES[t] ?? t);
}

export function storyTokens(text: string): Set<string> {
  return new Set(aliased(text).filter((t) => !UBIQUITOUS.has(t)));
}

export interface ClusterOptions {
  /** Minimum overlap coefficient for a signal to join a story. */
  threshold: number;
  /** A story stops accepting signals this long after its latest one. */
  windowMs: number;
}

export const DEFAULT_CLUSTER: ClusterOptions = { threshold: 0.5, windowMs: 48 * 60 * 60 * 1000 };

const CATEGORY_KEYWORDS: Array<[Category, RegExp]> = [
  ["economy", /\b(rate|inflation|cpi|gdp|unemployment|job|labour|bank|economy|tariff|dollar|recession|wage)\b/],
  ["housing", /\b(housing|home|rent|mortgage|crea|cmhc|condo|starts)\b/],
  ["weather", /\b(snow|storm|rain|heat|heatwave|cold|wildfire|weather|forecast|flood|temperature)\b/],
  ["culture", /\b(giller|juno|polaris|album|film|box|office|award|festival|tiff|series|book|prize)\b/],
  ["science", /\b(space|rocket|launch|satellite|research|ai|science|telescope|moon|vaccine)\b/],
  ["sports", /\b(nhl|cfl|mls|nba|leaf|canadien|habs|oiler|canuck|jet|flame|senator|raptor|grey|playoff|olympic)\b/],
];

export function guessCategory(text: string): Category | null {
  const words = aliased(text).join(" ");
  for (const [category, re] of CATEGORY_KEYWORDS) if (re.test(words)) return category;
  return null;
}

/** Groups signals into stories. Input order doesn't matter; output is sorted by heat, hottest first. */
export function clusterSignals(signals: readonly Signal[], now: Date, opts: ClusterOptions = DEFAULT_CLUSTER): Story[] {
  const sorted = [...new Map(signals.map((s) => [s.id, s])).values()].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const open: Array<{ tokens: Set<string>; titleTokens: Set<string>; signals: Signal[]; last: number }> = [];

  for (const signal of sorted) {
    const toks = storyTokens(`${signal.title} ${signal.summary.slice(0, 200)}`);
    const titleToks = storyTokens(signal.title);
    const at = Date.parse(signal.publishedAt);
    let best: (typeof open)[number] | null = null;
    let bestScore = 0;
    for (const story of open) {
      if (at - story.last > opts.windowMs) continue;
      // Either direction: the new headline inside the story, or the story's first headline inside the new item.
      const score = Math.max(overlap(titleToks, story.tokens), overlap(story.titleTokens, toks));
      if (score > bestScore) [best, bestScore] = [story, score];
    }
    if (best && bestScore >= opts.threshold) {
      best.signals.push(signal);
      for (const t of toks) best.tokens.add(t);
      best.last = Math.max(best.last, at);
    } else {
      open.push({ tokens: toks, titleTokens: titleToks, signals: [signal], last: at });
    }
  }

  return open.map((c) => toStory(c.signals, now)).sort((a, b) => b.heat - a.heat || a.id.localeCompare(b.id));
}

/** Hours for a story's heat to halve when nothing new arrives. */
export const HEAT_HALF_LIFE_H = 18;

/**
 * Heat, 0–100: weighted source count with diminishing returns, boosted for distinct outlets and for coverage in
 * both languages, decayed by the age of the latest signal. A story in EN and FR from three outlets in the last
 * hour lands near 90; one trending search from yesterday lands under 20.
 */
export function heatOf(signals: readonly Signal[], now: Date): number {
  if (signals.length === 0) return 0;
  const weight = signals.reduce((sum, s) => sum + s.weight, 0);
  const outlets = new Set(signals.map((s) => s.sourceId)).size;
  const langs = new Set(signals.map((s) => s.lang)).size;
  const official = signals.some((s) => s.kind === "official");
  const latest = Math.max(...signals.map((s) => Date.parse(s.publishedAt)));
  const ageH = Math.max(0, (now.getTime() - latest) / 3_600_000);

  const volume = 1 - Math.exp(-weight / 2.5); // 0..1, saturating
  const breadth = Math.min(1, outlets / 4); // 0..1
  const raw = 0.55 * volume + 0.25 * breadth + (langs > 1 ? 0.12 : 0) + (official ? 0.08 : 0);
  const decay = Math.pow(0.5, ageH / HEAT_HALF_LIFE_H);
  return Math.round(Math.min(1, raw) * decay * 100);
}

function toStory(signals: Signal[], now: Date): Story {
  const byWeight = [...signals].sort((a, b) => b.weight - a.weight || b.title.length - a.title.length);
  const headline = byWeight[0]!.title;
  const times = signals.map((s) => s.publishedAt).sort();
  const id = createHash("sha256").update(signals.map((s) => s.id).sort().join(",")).digest("hex").slice(0, 12);
  return {
    id,
    signals,
    headline,
    langs: [...new Set(signals.map((s) => s.lang))].sort(),
    firstSeenAt: times[0]!,
    lastSeenAt: times[times.length - 1]!,
    heat: heatOf(signals, now),
    categoryHint: guessCategory(signals.map((s) => s.title).join(" ")),
  };
}
