/**
 * Questions the editor suggests (zack, 2026-11-25: "an easier way to feed the engine better questions").
 *
 * The editor types an idea on the review page: a rough question, a topic or a headline. It becomes a one-signal story
 * that the right desk writes like any other: same rules, same safety screen, same checker, same approval. The idea
 * only steers what gets written; it never skips a check.
 */
import { createHash } from "node:crypto";
import type { Story } from "@/engine/types";

export const IDEA_MIN = 8;
export const IDEA_MAX = 400;
export const IDEA_SOURCE = "editor-idea";

/** Rough French guess, so the story is labelled in the editor's language. */
const looksFrench = (s: string) => /[àâçéèêëîïôûùüÿœ]|\b(le|la|les|des|est-ce|sera|est)\b/i.test(s);

export function ideaStory(text: string, now: Date, pageUrl: string): Story {
  const idea = text.replace(/\s+/g, " ").trim().slice(0, IDEA_MAX);
  const id = `idea-${createHash("sha256").update(idea.toLowerCase()).digest("hex").slice(0, 16)}`;
  const at = now.toISOString();
  const lang = looksFrench(idea) ? "fr" : "en";
  return {
    id,
    headline: idea,
    signals: [{ id: `${id}-0`, sourceId: IDEA_SOURCE, kind: "news", lang, title: idea, summary: "", url: pageUrl, publishedAt: at, weight: 3 }],
    langs: [lang],
    firstSeenAt: at,
    lastSeenAt: at,
    heat: 100,
    categoryHint: null,
  };
}

export const isIdea = (story: Story) => story.id.startsWith("idea-");
