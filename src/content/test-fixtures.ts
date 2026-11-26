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
      // Made-up post addresses, so e2e can check the platform logos. Fixtures never ship.
      socialLinks: [
        { platform: "instagram", url: "https://www.instagram.com/stories/CANsensus/1/" },
        { platform: "facebook", url: "https://www.facebook.com/CANsensus/posts/1" },
        { platform: "threads", url: "https://www.threads.com/@cansensus/post/1", locale: "fr" },
      ],
      socialPosts: [{ platform: "x", postId: "1", locale: "en" }],
      // Made-up totals, as the daily run would find them: X and Threads polls, Instagram YES/NO comments, Facebook reactions.
      socialPolls: [
        { platform: "x", yes: 812, no: 431, closedAt: "2026-11-20T18:00:00Z", url: "https://x.com/CANsensus/status/1" },
        { platform: "threads", yes: 304, no: 198, closedAt: "2026-11-20T18:00:00Z", url: "https://www.threads.com/@cansensus/post/1" },
        { platform: "instagram", yes: 2104, no: 1388, closedAt: "2026-11-20T18:00:00Z", url: "https://www.instagram.com/stories/CANsensus/1/", source: "comments" },
        { platform: "facebook", yes: 940, no: 610, closedAt: "2026-11-20T18:00:00Z", url: "https://www.facebook.com/CANsensus/posts/1", source: "reactions" },
      ],
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
    // Two made-up questions that hold the "closing soon" and "closed, waiting for the result" states at the e2e date
    // (Nov 6). Real questions settle on the real calendar, so they can't hold those states for the tests.
    {
      slug: "fixture-closing-soon",
      category: "culture",
      question: { en: "Test question: will this one still take a call before it closes?", fr: "Question d’essai : celle-ci prendra-t-elle encore une prévision avant de fermer?" },
      scored: true,
      // 04:59 UTC on Nov 8 is 11:59 p.m. Eastern on Nov 7 (LEX: closing dates are Eastern calendar days).
      closesAt: "2026-11-08T04:59:00Z",
      forecasters: 4120,
      history: series(30, [[0, 22], [9, 24], [21, 33], [29, 31]]),
      provinces: { BC: 30, AB: 27, PR: 29, ON: 34, QC: 28, AT: 33 },
      languages: { en: 31, fr: 30 },
      events: [],
      resolution: {
        source: { name: { en: "Test source", fr: "Source d’essai" }, url: "https://gillerprize.ca/" },
        rule: { en: "Test only. Resolves YES if the test source says yes.", fr: "Essai seulement. Résolue OUI si la source d’essai dit oui." },
        resolvesAt: "2026-11-17T03:00:00Z",
      },
    },
    {
      slug: "fixture-closed-waiting",
      category: "economy",
      question: { en: "Test question: will the test unemployment rate be 7.0% or higher?", fr: "Question d’essai : le taux de chômage d’essai sera-t-il de 7,0\u00a0% ou plus?" },
      scored: true,
      closesAt: "2026-11-05T13:00:00Z",
      forecasters: 8655,
      history: series(30, [[0, 58], [18, 55], [29, 49]]),
      provinces: { BC: 47, AB: 52, PR: 46, ON: 53, QC: 41, AT: 50 },
      languages: { en: 51, fr: 43 },
      events: [],
      resolution: {
        source: { name: { en: "Test source", fr: "Source d’essai" }, url: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701" },
        rule: { en: "Test only. Resolves YES if the test source says 7.0% or higher.", fr: "Essai seulement. Résolue OUI si la source d’essai indique 7,0\u00a0% ou plus." },
        resolvesAt: "2026-11-07T13:30:00Z",
      },
    },
    // Two made-up questions for the heat tags and an event page (2026-11-25). At the e2e date (Nov 6, noon UTC) the
    // first is "Breaking" and the second "Trending", and both belong to a made-up event that starts on Nov 8.
    ...[
      { slug: "fixture-breaking", en: "Test question: will the test story still lead the news?", fr: "Question d’essai : l’histoire d’essai fera-t-elle encore la une?", spotlight: { newsSize: 80, publishedAt: "2026-11-06T09:00:00Z", breakingUntil: "2026-11-06T15:00:00Z" } },
      { slug: "fixture-trending", en: "Test question: will the test trend still be talked about?", fr: "Question d’essai : la tendance d’essai fera-t-elle encore jaser?", spotlight: { newsSize: 30, publishedAt: "2026-11-06T08:00:00Z", trending: true as const } },
    ].map((f) => ({
      slug: f.slug,
      category: "culture" as const,
      question: { en: f.en, fr: f.fr },
      scored: true,
      closesAt: "2026-11-20T04:59:00Z",
      forecasters: 120,
      history: series(30, [[0, 40], [29, 44]]),
      provinces: { BC: 44, AB: 43, PR: 45, ON: 44, QC: 46, AT: 42 },
      events: [],
      spotlight: { ...f.spotlight, event: { id: "fixture-gala", name: { en: "Test Gala", fr: "Gala d’essai" }, at: "2026-11-08T01:00:00Z" } },
      resolution: {
        source: { name: { en: "Test source", fr: "Source d’essai" }, url: "https://gillerprize.ca/" },
        rule: { en: "Test only. Resolves YES if the test source says yes.", fr: "Essai seulement. Résolue OUI si la source d’essai dit oui." },
        resolvesAt: "2026-11-21T03:00:00Z",
      },
    })),
  ];
}
