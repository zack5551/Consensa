import type { Http } from "@/engine/resolve/resolvers";
import type { Draft, Signal, Story } from "@/engine/types";
import { heatOf } from "@/engine/stories";

export const NOW = new Date("2026-11-06T12:00:00Z");

export function signal(over: Partial<Signal> & Pick<Signal, "title">): Signal {
  return {
    id: over.id ?? over.title.toLowerCase().replace(/\W+/g, "-").slice(0, 40),
    sourceId: "cbc-canada",
    kind: "news",
    lang: "en",
    summary: "",
    url: `https://example.ca/${encodeURIComponent(over.title.slice(0, 20))}`,
    publishedAt: "2026-11-06T10:00:00Z",
    weight: 1,
    ...over,
  };
}

export function story(signals: Signal[], over: Partial<Story> = {}): Story {
  return {
    id: "story-1",
    signals,
    headline: signals[0]!.title,
    langs: ["en"],
    firstSeenAt: signals[0]!.publishedAt,
    lastSeenAt: signals[0]!.publishedAt,
    heat: heatOf(signals, NOW),
    categoryHint: null,
    ...over,
  };
}

/** A clean draft that passes every check at NOW. Tests break one thing at a time. */
export function goodDraft(over: Partial<Draft> = {}): Draft {
  return {
    slug: "unemployment-7pct-nov-2026",
    category: "economy",
    question: {
      en: "Will Canada's unemployment rate be 7% or higher in November 2026?",
      fr: "Le taux de chômage au Canada atteindra-t-il 7 % ou plus en novembre 2026?",
    },
    scored: true,
    closesAt: "2026-12-04T13:00:00Z",
    resolution: {
      source: { name: { en: "Statistics Canada", fr: "Statistique Canada" }, url: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701" },
      rule: {
        en: "Resolves YES if the first published seasonally adjusted unemployment rate for Canada for November 2026 is 7% or higher. Otherwise it resolves NO.",
        fr: "Résolue OUI si le premier taux de chômage désaisonnalisé publié pour le Canada pour novembre 2026 est de 7 % ou plus. Sinon, elle est résolue NON.",
      },
      resolvesAt: "2026-12-04T13:45:00Z",
    },
    resolver: { kind: "statcan-vector", vectorId: 2062815, refPeriod: "2026-11", comparator: ">=", threshold: 7, unit: "%" },
    editorNote: "Jobs are in the news.",
    ...over,
  };
}

type Route = { match: RegExp; method?: "GET" | "POST"; body: unknown; status?: number };

/** A fake network: the first route whose regex matches the URL answers. Records every call. */
export function fakeHttp(routes: Route[]): Http & { calls: string[] } {
  const calls: string[] = [];
  const answer = (method: "GET" | "POST", url: string) => {
    calls.push(`${method} ${url}`);
    const r = routes.find((x) => x.match.test(url) && (!x.method || x.method === method));
    const status = r ? (r.status ?? 200) : 404;
    return Promise.resolve({
      ok: status < 400,
      status,
      text: () => Promise.resolve(typeof r?.body === "string" ? r.body : JSON.stringify(r?.body ?? null)),
      json: () => Promise.resolve(r?.body ?? null),
    });
  };
  return { calls, get: (url) => answer("GET", url), post: (url) => answer("POST", url) };
}
