import "server-only";
import { sampleQuestions } from "@/content/sample-questions";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { logErrorCode } from "@/lib/server/error-code-log";
import { siteUrl } from "@/lib/site-url";
import { adminSupabase } from "@/lib/supabase/admin";
import { fill } from "@/lib/text";
import { AUTO_REPLY_MAX_PER_CYCLE, countSocialReplies, officialPosts, type CountReport } from "./count";
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

/** Counts only. `sweep` is null when the deleted-reply sweep itself failed this run (it runs again tomorrow). */
export type SocialReport = CountReport & { sweep: SweepReport | null };

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
 * approve_social_sweep(), run by hand in the database (see sweep.ts).
 */
export async function runSocialStep(now: Date, env: Record<string, string | undefined> = process.env): Promise<SocialReport | null> {
  if (!socialVotingOn(env)) return null;
  const config = socialEnv(env);
  const admin = adminSupabase();
  if (!admin || !config.SOCIAL_LINK_SECRET) return null;

  const store = new SupabaseSocialStore(admin, config.SOCIAL_LINK_SECRET);
  const providers: Partial<Record<Platform, SocialProvider>> = {};
  const xSpend = new SpendCap(store, "x", usdToMicros(config.X_MONTHLY_CAP_USD));
  if (config.X_BEARER_TOKEN) providers.x = new XProvider({ bearer: config.X_BEARER_TOKEN, spend: xSpend, replyToken: config.X_REPLY_TOKEN });
  if (config.META_PAGE_TOKEN) providers.facebook = new MetaProvider({ platform: "facebook", accessToken: config.META_PAGE_TOKEN });
  if (config.META_INSTAGRAM_TOKEN) providers.instagram = new MetaProvider({ platform: "instagram", accessToken: config.META_INSTAGRAM_TOKEN });
  if (config.META_THREADS_TOKEN) providers.threads = new MetaProvider({ platform: "threads", accessToken: config.META_THREADS_TOKEN });

  const posts = officialPosts(sampleQuestions, now);
  // LEX: daily, not weekly. A failed sweep never stops the count. On X (the paid one) the sweep gets at most half
  // of what is left under the monthly cap, so the count below always has room (AEGIS).
  const sweepsX = Boolean(providers.x) && posts.some((p) => p.platform === "x");
  const allowanceMicros = sweepsX ? { x: Math.floor((await xSpend.remaining(now)) * SWEEP_BUDGET_SHARE) } : {};
  const sweep = await sweepDeletedReplies({ posts, providers, store, now, allowanceMicros }).catch(() => null);
  // AEGIS: a halted sweep is logged by code, so a person sees it. Nothing but the code is logged.
  if (sweep?.halted) logErrorCode("social-sweep", "halted");
  const count = await countSocialReplies({
    posts,
    providers,
    store,
    now,
    ...(autoReplyOn(env) ? { autoReply: { text: autoReplyText(siteUrl()), maxPerCycle: AUTO_REPLY_MAX_PER_CYCLE } } : {}),
  });
  return { ...count, sweep };
}
