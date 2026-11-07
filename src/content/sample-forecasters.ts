import type { ForecasterRecord } from "@/lib/leaderboard";
import type { ScoredCall } from "@/lib/record";
import type { Region } from "@/lib/regions";
import { isOpen, questionState } from "@/lib/question";
import { SAMPLE_NOW, sampleQuestions } from "./sample-questions";
import { sampleResults, type Result } from "./sample-results";

/**
 * Sample forecasters for the leaderboard and public profiles, until accounts land.
 * Generated from a fixed seed so every build shows the same board. Handles are made up; no real people.
 */

/** The signed-in person in the preview. Their record is written by hand so the record screen tells a clear story. */
export const SAMPLE_ME = "fundy-tides";

/** Small, fast, seeded PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clampPercent = (v: number) => Math.min(99, Math.max(1, Math.round(v)));

function toCall(r: Result, userPercent: number): ScoredCall {
  return { slug: r.slug, category: r.category, userPercent: clampPercent(userPercent), crowdPercent: r.national, outcome: r.outcome, resolvedAt: r.resolvedAt };
}

type Profile = { handle: string; displayName: string; region: Region; joinedAt: string; skill: number; noise: number; participation: number };

const people: ReadonlyArray<Omit<Profile, "skill" | "noise" | "participation">> = [
  { handle: "boreal-bayes", displayName: "Boreal Bayes", region: "QC", joinedAt: "2026-08-02" },
  { handle: "chinook-check", displayName: "Chinook Check", region: "AB", joinedAt: "2026-08-04" },
  { handle: "brume-du-fleuve", displayName: "Brume du fleuve", region: "QC", joinedAt: "2026-08-05" },
  { handle: "okanagan-owl", displayName: "Okanagan Owl", region: "BC", joinedAt: "2026-08-06" },
  { handle: "rideau-rower", displayName: "Rideau Rower", region: "ON", joinedAt: "2026-08-07" },
  { handle: "saskatoon-sky", displayName: "Saskatoon Sky", region: "PR", joinedAt: "2026-08-08" },
  { handle: "peggys-point", displayName: "Peggy’s Point", region: "AT", joinedAt: "2026-08-09" },
  { handle: "le-hibou", displayName: "Le Hibou", region: "QC", joinedAt: "2026-08-10" },
  { handle: "muskoka-mind", displayName: "Muskoka Mind", region: "ON", joinedAt: "2026-08-11" },
  { handle: "harbourlight", displayName: "Harbourlight", region: "BC", joinedAt: "2026-08-12" },
  { handle: "cap-diamant", displayName: "Cap Diamant", region: "QC", joinedAt: "2026-08-13" },
  { handle: "bytown-brier", displayName: "Bytown Brier", region: "ON", joinedAt: "2026-08-14" },
  { handle: "prairie-fox", displayName: "Prairie Fox", region: "PR", joinedAt: "2026-08-15" },
  { handle: "tundra-tally", displayName: "Tundra Tally", region: "AB", joinedAt: "2026-08-16" },
  { handle: "erable-et-cie", displayName: "Érable et cie", region: "QC", joinedAt: "2026-08-17" },
  { handle: "kelowna-calls", displayName: "Kelowna Calls", region: "BC", joinedAt: "2026-08-18" },
  { handle: "gaspesie", displayName: "Gaspésie", region: "QC", joinedAt: "2026-08-19" },
  { handle: "lakeshore-log", displayName: "Lakeshore Log", region: "ON", joinedAt: "2026-08-20" },
  { handle: "red-river-read", displayName: "Red River Read", region: "PR", joinedAt: "2026-08-21" },
  { handle: "island-almanac", displayName: "Island Almanac", region: "AT", joinedAt: "2026-08-22" },
  { handle: "foothills-fc", displayName: "Foothills Forecast", region: "AB", joinedAt: "2026-08-23" },
  { handle: "salish-signal", displayName: "Salish Signal", region: "BC", joinedAt: "2026-08-24" },
  { handle: "plateau-mont-royal", displayName: "Plateau", region: "QC", joinedAt: "2026-08-25" },
  { handle: "niagara-nowcast", displayName: "Niagara Nowcast", region: "ON", joinedAt: "2026-08-26" },
  { handle: "grand-banks", displayName: "Grand Banks", region: "AT", joinedAt: "2026-08-27" },
  { handle: "canola-curve", displayName: "Canola Curve", region: "PR", joinedAt: "2026-08-28" },
  { handle: "york-region-yeti", displayName: "York Yeti", region: "ON", joinedAt: "2026-08-29" },
  { handle: "sudbury-signal", displayName: "Sudbury Signal", region: "ON", joinedAt: "2026-08-30" },
  { handle: "fjord-du-saguenay", displayName: "Fjord", region: "QC", joinedAt: "2026-09-01" },
  { handle: "rocky-ridge", displayName: "Rocky Ridge", region: "AB", joinedAt: "2026-09-02" },
  { handle: "tofino-tide", displayName: "Tofino Tide", region: "BC", joinedAt: "2026-09-03" },
  { handle: "moncton-meter", displayName: "Moncton Meter", region: "AT", joinedAt: "2026-09-04" },
  { handle: "winnipeg-wind", displayName: "Winnipeg Wind", region: "PR", joinedAt: "2026-08-03" },
  { handle: "new-here", displayName: "New Here", region: "ON", joinedAt: "2026-11-01" },
];

/** Hand-written record for SAMPLE_ME: ahead of the crowd overall, one bold "Called it!", a couple of misses. */
const myCalls: Record<string, number> = {
  "cpi-sept-2026": 78,
  "boc-hold-oct-2026": 80,
  "yul-snow-oct-2026": 22,
  "yvr-rain-oct-2026": 64,
  "home-sales-sept-2026": 45,
  "jobless-sept-2026": 66,
  "giller-shortlist-2026": 58,
  "halifax-warm-sept-2026": 81,
  "calgary-25c-sept-2026": 40,
  "polaris-french-2026": 62,
  "tiff-canadian-2026": 24,
  "cpi-aug-2026": 35,
  "starts-aug-2026": 41,
  "gdp-q2-2026": 70,
};

function generate(): ForecasterRecord[] {
  const rand = rng(20261106);
  const gauss = () => {
    const u = Math.max(1e-9, rand());
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const generated = people.map((p, i): ForecasterRecord => {
    // A spread of skill: a few sharp forecasters, most near the crowd, some behind it.
    const skill = 0.6 - (i / people.length) * 1.0 + gauss() * 0.12;
    const noise = 0.35 + rand() * 0.5;
    const participation = p.handle === "new-here" ? 0.15 : 0.55 + rand() * 0.45;
    const calls = sampleResults.flatMap((r) => {
      if (Date.parse(r.resolvedAt) < Date.parse(p.joinedAt) || rand() > participation) return [];
      const regionCrowd = r.regions[p.region].percent / 100;
      const towardTruth = (r.outcome === 1 ? 1 : -1) * skill;
      const x = logit(regionCrowd) + towardTruth + gauss() * noise;
      return [toCall(r, sigmoid(x) * 100)];
    });
    return { ...p, calls };
  });

  const me: ForecasterRecord = {
    handle: SAMPLE_ME,
    displayName: "Fundy Tides",
    region: "ON",
    joinedAt: "2026-08-01",
    calls: sampleResults.flatMap((r) => (r.slug in myCalls ? [toCall(r, myCalls[r.slug]!)] : [])),
  };

  return [me, ...generated];
}

export const sampleForecasters: readonly ForecasterRecord[] = generate();

export function getForecaster(handle: string): ForecasterRecord | undefined {
  return sampleForecasters.find((f) => f.handle === handle);
}


/**
 * Current calls on open questions, for the "sharpest forecasters" line. Each forecaster sits near their
 * region's crowd with their own spread, from a fixed seed. Keyed by handle, then question slug.
 */
function generateOpenCalls(): Record<string, Record<string, number>> {
  const rand = rng(1107);
  const open = sampleQuestions.filter((q) => q.scored && isOpen(questionState(q, SAMPLE_NOW)));
  const out: Record<string, Record<string, number>> = {};
  for (const f of sampleForecasters) {
    const mine: Record<string, number> = {};
    for (const q of open) {
      if (rand() > 0.8) continue;
      const base = logit(Math.min(99, Math.max(1, q.provinces[f.region])) / 100);
      mine[q.slug] = clampPercent(sigmoid(base + (rand() - 0.5) * 1.4) * 100);
    }
    out[f.handle] = mine;
  }
  return out;
}

export const sampleOpenCalls: Readonly<Record<string, Readonly<Record<string, number>>>> = generateOpenCalls();
