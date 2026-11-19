import "server-only";
import { sampleQuestions } from "@/content/sample-questions";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { siteUrl } from "@/lib/site-url";
import { adminSupabase } from "@/lib/supabase/admin";
import { fill } from "@/lib/text";
import { AUTO_REPLY_MAX_PER_CYCLE, countSocialReplies, officialPosts, type CountReport } from "./count";
import { autoReplyOn, socialEnv, socialVotingOn } from "./env";
import { MetaProvider } from "./providers/meta";
import { XProvider } from "./providers/x";
import { SpendCap, usdToMicros } from "./spend";
import { SupabaseSocialStore } from "./supabase-store";
import type { Platform, SocialProvider } from "./types";

/** The link in the public auto-reply: the plain address of the linking page, with no tracking of any kind (LEX). */
export function autoReplyText(base: string): Record<"en" | "fr", string> {
  return {
    en: fill(en.socialLink.autoReply, { link: `${base}/en/account/social` }),
    fr: fill(fr.socialLink.autoReply, { link: `${base}/fr/account/social` }),
  };
}

/**
 * The social step of the daily cycle. Returns null, having called nothing, while SOCIAL_VOTING is off or the
 * database or the signing secret is missing. A provider is created only when its own key is set.
 */
export async function runSocialStep(now: Date, env: Record<string, string | undefined> = process.env): Promise<CountReport | null> {
  if (!socialVotingOn(env)) return null;
  const config = socialEnv(env);
  const admin = adminSupabase();
  if (!admin || !config.SOCIAL_LINK_SECRET) return null;

  const store = new SupabaseSocialStore(admin, config.SOCIAL_LINK_SECRET);
  const providers: Partial<Record<Platform, SocialProvider>> = {};
  if (config.X_BEARER_TOKEN) {
    providers.x = new XProvider({ bearer: config.X_BEARER_TOKEN, spend: new SpendCap(store, "x", usdToMicros(config.X_MONTHLY_CAP_USD)), replyToken: config.X_REPLY_TOKEN });
  }
  if (config.META_PAGE_TOKEN) providers.facebook = new MetaProvider({ platform: "facebook", accessToken: config.META_PAGE_TOKEN });
  if (config.META_INSTAGRAM_TOKEN) providers.instagram = new MetaProvider({ platform: "instagram", accessToken: config.META_INSTAGRAM_TOKEN });
  if (config.META_THREADS_TOKEN) providers.threads = new MetaProvider({ platform: "threads", accessToken: config.META_THREADS_TOKEN });

  return countSocialReplies({
    posts: officialPosts(sampleQuestions, now),
    providers,
    store,
    now,
    // Checking for deleted replies costs a read per counted reply on X, so it runs once a week (Mondays, UTC).
    sweepDeleted: now.getUTCDay() === 1,
    ...(autoReplyOn(env) ? { autoReply: { text: autoReplyText(siteUrl()), maxPerCycle: AUTO_REPLY_MAX_PER_CYCLE } } : {}),
  });
}
