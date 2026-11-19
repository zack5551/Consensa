import type { questionSchema } from "@/lib/question";
import type { z } from "zod";
import { series } from "./series";

/**
 * Test fixtures: two made-up game questions, one upcoming and one cancelled (AEGIS, 2026-11-19).
 * They are NOT real games: the matchups, dates and the cancellation are invented, so they must never ship.
 * sample-questions.ts adds them only when the build sets CONSENSA_TEST_FIXTURES=1, which playwright.config.ts does
 * for the e2e build. next.config.ts fixes the value at build time, so a production build drops this module and no
 * running server can switch it on. Unit tests import them from here directly.
 */
export function fixtureQuestions(): z.input<typeof questionSchema>[] {
  return [
    // A game question. Pre-game only: calls close at the scheduled start.
    {
      slug: "canadiens-leafs-nov-21-2026",
      category: "sports",
      question: {
        en: "Will the Canadiens beat the Maple Leafs on November 21?",
        fr: "Les Canadiens battront-ils les Maple Leafs le 21 novembre?",
      },
      scored: true,
      closesAt: "2026-11-22T00:00:00Z",
      game: { league: "NHL", home: "Canadiens", away: "Maple Leafs", startsAt: "2026-11-22T00:00:00Z" },
      forecasters: 9480,
      history: series(30, [[0, 52], [16, 49], [29, 54]]),
      provinces: { BC: 50, AB: 48, PR: 51, ON: 34, QC: 78, AT: 57 },
      languages: { en: 44, fr: 76 },
      events: [],
      resolution: {
        source: { name: { en: "NHL", fr: "LNH" }, url: "https://www.nhl.com/scores" },
        rule: {
          en: "Resolves YES if the Montreal Canadiens win their game against the Toronto Maple Leafs scheduled for November 21, 2026, in regulation, overtime or a shootout, according to the final result on nhl.com. Resolves NO if the Maple Leafs win. If the game is postponed or cancelled, the question is cancelled and nobody is scored.",
          fr: "Résolue OUI si les Canadiens de Montréal remportent leur match contre les Maple Leafs de Toronto prévu le 21 novembre 2026, en temps réglementaire, en prolongation ou en tirs de barrage, selon le résultat final publié sur nhl.com. Résolue NON si les Maple Leafs l’emportent. Si le match est reporté ou annulé, la question est annulée et personne n’est évalué.",
        },
        resolvesAt: "2026-11-22T05:00:00Z",
      },
    },
    // A game settled as cancelled, so the state is visible. Nobody is scored on it.
    {
      slug: "oilers-canucks-nov-3-2026",
      category: "sports",
      question: {
        en: "Will the Oilers beat the Canucks on November 3?",
        fr: "Les Oilers battront-ils les Canucks le 3 novembre?",
      },
      scored: true,
      closesAt: "2026-11-04T02:00:00Z",
      game: { league: "NHL", home: "Oilers", away: "Canucks", startsAt: "2026-11-04T02:00:00Z" },
      forecasters: 6230,
      history: series(30, [[0, 58], [18, 55], [29, 57]]),
      provinces: { BC: 39, AB: 74, PR: 60, ON: 56, QC: 54, AT: 55 },
      languages: { en: 57, fr: 54 },
      events: [],
      resolution: {
        source: { name: { en: "NHL", fr: "LNH" }, url: "https://www.nhl.com/scores" },
        rule: {
          en: "Resolves YES if the Edmonton Oilers win their game against the Vancouver Canucks scheduled for November 3, 2026, in regulation, overtime or a shootout, according to the final result on nhl.com. Resolves NO if the Canucks win. If the game is postponed or cancelled, the question is cancelled and nobody is scored.",
          fr: "Résolue OUI si les Oilers d’Edmonton remportent leur match contre les Canucks de Vancouver prévu le 3 novembre 2026, en temps réglementaire, en prolongation ou en tirs de barrage, selon le résultat final publié sur nhl.com. Résolue NON si les Canucks l’emportent. Si le match est reporté ou annulé, la question est annulée et personne n’est évalué.",
        },
        resolvesAt: "2026-11-04T07:00:00Z",
        result: { outcome: "cancelled", publishedAt: "2026-11-04T03:00:00Z" },
      },
    },
  ];
}
