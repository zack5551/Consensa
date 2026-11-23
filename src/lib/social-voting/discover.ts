/**
 * Ties the polls zack posts by hand on @CANsensus to our questions (zack, 2026-11-21). A poll belongs to a question
 * when its post carries that question's page link on our own site: /en/q/<slug> or /fr/q/<slug>. Anything else
 * (another site, an unknown slug, a closed question, a poll that isn't YES/NO) is left alone. Framework-free.
 */
import { callsCloseAt, isOpen, questionState, type Question } from "@/lib/question";
import type { OfficialPost } from "./count";
import type { FoundPoll } from "./providers/x";
import type { Platform, PollTotals } from "./types";

export type DiscoveredPoll = OfficialPost & { poll: PollTotals; endsAt: string | null };

type Q = Pick<Question, "slug" | "closesAt" | "startsAt" | "category" | "resolution" | "game">;

const QUESTION_PATH = /^\/(en|fr)\/q\/([a-z0-9-]+)(?:\/|$)/;

/** The locale and slug a link points to, when it is a question page on one of our own hosts. */
export function questionFromLink(link: string, ownHosts: ReadonlySet<string>): { locale: "en" | "fr"; slug: string } | null {
  try {
    const url = new URL(link);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !ownHosts.has(url.hostname)) return null;
    const m = QUESTION_PATH.exec(url.pathname);
    return m ? { locale: m[1] as "en" | "fr", slug: m[2]! } : null;
  } catch {
    return null;
  }
}

/**
 * Each of our own posts that links one of our open questions, as an official post on that platform, with what was
 * found. The first question link in a post decides; a post linking two different questions is skipped, since its
 * votes can't be split.
 */
export function matchOwnPosts<T extends { postId: string; links: readonly string[] }>(
  platform: Platform,
  found: readonly T[],
  questions: readonly Q[],
  ownHosts: ReadonlySet<string>,
  now: Date,
): { post: OfficialPost; found: T }[] {
  const open = new Map(questions.filter((q) => isOpen(questionState(q as Question, now))).map((q) => [q.slug, q]));
  return found.flatMap((f) => {
    const targets = f.links.flatMap((l) => {
      const t = questionFromLink(l, ownHosts);
      return t ? [t] : [];
    });
    const slugs = new Set(targets.map((t) => t.slug));
    const target = targets[0];
    const q = target && open.get(target.slug);
    if (!target || !q || slugs.size !== 1) return [];
    return [{ post: { platform, postId: f.postId, slug: q.slug, locale: target.locale, closesAt: callsCloseAt(q) }, found: f }];
  });
}

/** The X polls among our own posts that link one of our open questions, with their totals. */
export function matchOwnPolls(found: readonly FoundPoll[], questions: readonly Q[], ownHosts: ReadonlySet<string>, now: Date): DiscoveredPoll[] {
  return matchOwnPosts("x", found, questions, ownHosts, now).map(({ post, found: f }) => ({ ...post, poll: f.poll, endsAt: f.endsAt }));
}

/** Our own hosts, from the public site address plus any extra ones the deployment answers on. */
export function ownHostsFrom(urls: readonly (string | undefined)[]): Set<string> {
  const hosts = new Set<string>();
  for (const u of urls) {
    if (!u) continue;
    try {
      const host = new URL(u.startsWith("http") ? u : `https://${u}`).hostname;
      if (host && host !== "localhost") hosts.add(host);
    } catch {
      // not an address: skip it
    }
  }
  return hosts;
}
