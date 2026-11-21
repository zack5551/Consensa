import "server-only";
import { sampleQuestions } from "@/content/sample-questions";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { logErrorCode } from "@/lib/server/error-code-log";
import { siteUrl } from "@/lib/site-url";
import { adminSupabase } from "@/lib/supabase/admin";
import { fill } from "@/lib/text";
import { OFFICIAL_HANDLE_DISPLAY } from "@/lib/social";
import { AUTO_REPLY_MAX_PER_CYCLE, countSocialReplies, officialPosts, type CountReport, type OfficialPost, type ReadPatch } from "./count";
import { matchOwnPolls, matchOwnPosts, ownHostsFrom } from "./discover";
import { autoReplyOn, socialEnv, socialVotingOn } from "./env";
import { MetaProvider } from "./providers/meta";
import { XProvider } from "./providers/x";
import { SpendCap, usdToMicros } from "./spend";
import { SupabaseSocialStore } from "./supabase-store";
import { SWEEP_BUDGET_SHARE, sweepDeletedReplies, type SweepReport } from "./sweep";
import type { Platform, SocialProvider } from "./types";

/** The link in the public auto-reply: the plain address of the linking page, with no tracking of any kind (LEX). */
export function autoReplyText(base: string): Record<"en" | "fr", string> {
  return {
    en: fill(en.socialLink.autoReply, { link: `${base}/en/account/social` }),
    fr: fill(fr.socialLink.autoReply, { link: `${base}/fr/account/social` }),
  };
}

/**
 * Counts only. `sweep` is null when the deleted-reply sweep itself failed this run (it runs again tomorrow).
 * `pollsFound`: posts on our own accounts with YES/NO totals that link one of our open questions (`discover.ts`).
 */
export type SocialReport = CountReport & { sweep: SweepReport | null; pollsFound: number };

/**
 * The social step of the daily cycle (Vercel Cron, once a day). Returns null, having called nothing, while
 * SOCIAL_VOTING is off or the database or the signing secret is missing. A provider is created only when its own
 * key is set.
 *
 * Two parts, every day: the sweep of deleted replies, then the count of new replies. The sweep goes first so that
 * a deleted reply is taken out before new ones come in. It may use at most half of what is left under the monthly
 * spend cap, so the count always keeps the other half.
 *
 * A sweep stopped by its removal ceiling logs the code "social-sweep: halted". The way past it is
 * approve_social_sweep(), run by hand in the database (see sweep.ts). While a halt is still open 72 hours after it
 * first happened, every run also logs "social-sweep: halt-unapproved-72h" (LEX), so zack hears about it again.
 */
export async function runSocialStep(now: Date, env: Record<string, string | undefined> = process.env): Promise<SocialReport | null> {
  if (!socialVotingOn(env)) return null;
  const config = socialEnv(env);
  const admin = adminSupabase();
  if (!admin || !config.SOCIAL_LINK_SECRET) return null;

  const store = new SupabaseSocialStore(admin, config.SOCIAL_LINK_SECRET);
  const providers: Partial<Record<Platform, SocialProvider>> = {};
  const xSpend = new SpendCap(store, "x", usdToMicros(config.X_MONTHLY_CAP_USD));
  const xProvider = config.X_BEARER_TOKEN ? new XProvider({ bearer: config.X_BEARER_TOKEN, spend: xSpend, replyToken: config.X_REPLY_TOKEN }) : undefined;
  if (xProvider) providers.x = xProvider;
  const meta: MetaProvider[] = [];
  if (config.META_PAGE_TOKEN) meta.push(new MetaProvider({ platform: "facebook", accessToken: config.META_PAGE_TOKEN }));
  if (config.META_INSTAGRAM_TOKEN) meta.push(new MetaProvider({ platform: "instagram", accessToken: config.META_INSTAGRAM_TOKEN, accountId: config.META_INSTAGRAM_ID }));
  if (config.META_THREADS_TOKEN) meta.push(new MetaProvider({ platform: "threads", accessToken: config.META_THREADS_TOKEN }));
  for (const m of meta) providers[m.platform] = m;

  const posts: OfficialPost[] = officialPosts(sampleQuestions, now);
  // zack, 2026-11-21: a poll posted by hand on @CANsensus with a question's link in it is found here, its totals
  // saved for the question page, and it joins the official posts (so linked replies under it count too).
  // The same for Threads and Instagram polls, Facebook reaction posts and Instagram YES/NO comment posts.
  let pollsFound = 0;
  const own = ownHostsFrom([siteUrl(), env.NEXT_PUBLIC_SITE_URL, env.VERCEL_PROJECT_PRODUCTION_URL]);
  const known = new Set(posts.map((p) => `${p.platform}:${p.postId}`));
  const keep = async (post: OfficialPost, patch: ReadPatch) => {
    const saved = await store.saveRead(post, patch, now).then(() => true, () => false);
    if (!saved) return;
    pollsFound += 1;
    if (!known.has(`${post.platform}:${post.postId}`)) posts.push({ ...post, pollKnown: true });
    known.add(`${post.platform}:${post.postId}`);
  };
  if (xProvider) {
    const found = await xProvider.findOwnPolls(OFFICIAL_HANDLE_DISPLAY, now, config.X_ACCOUNT_ID).catch(() => []);
    for (const { poll, endsAt, ...post } of matchOwnPolls(found, sampleQuestions, own, now)) await keep(post, { poll, pollEndsAt: endsAt });
  }
  for (const m of meta) {
    const found = await m.findOwnPosts(now).catch(() => []);
    for (const { post, found: f } of matchOwnPosts(m.platform, found, sampleQuestions, own, now)) {
      // AEGIS: reactions or comments are read only on a post that asks for them; a plain link post shows nothing.
      const poll = f.poll ?? (f.asksVote ? await m.readPollTotals(post.postId).catch(() => null) : null);
      if (poll && f.url) await keep(post, { poll, pollEndsAt: f.endsAt, postUrl: f.url });
    }
  }
  // LEX: daily, not weekly. A failed sweep never stops the count. On X (the paid one) the sweep gets at most half
  // of what is left under the monthly cap, so the count below always has room (AEGIS).
  const sweepsX = Boolean(providers.x) && posts.some((p) => p.platform === "x");
  const allowanceMicros = sweepsX ? { x: Math.floor((await xSpend.remaining(now)) * SWEEP_BUDGET_SHARE) } : {};
  const sweep = await sweepDeletedReplies({ posts, providers, store, now, allowanceMicros }).catch(() => null);
  // AEGIS: a halted sweep is logged by code, so a person sees it. Nothing but the code is logged.
  if (sweep?.halted) logErrorCode("social-sweep", "halted");
  // LEX: a halt may not sit. Still open 72 hours after it first happened: say so again, on every run until it is settled.
  if (sweep?.haltUnresolved72h) logErrorCode("social-sweep", "halt-unapproved-72h");
  const count = await countSocialReplies({
    posts,
    providers,
    store,
    now,
    ...(autoReplyOn(env) ? { autoReply: { text: autoReplyText(siteUrl()), maxPerCycle: AUTO_REPLY_MAX_PER_CYCLE } } : {}),
  });
  return { ...count, sweep, pollsFound };
}
