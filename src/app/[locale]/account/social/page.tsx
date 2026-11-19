/*
 * Screen: linked social accounts / « Comptes de réseaux sociaux liés » (account area, sprint 11).
 * One message: link a social account and your YES or NO replies to official @Cansensa posts count as your calls.
 * One action: tick the consent box and link my X account (or unlink it, in one click).
 * Hidden (404) while SOCIAL_VOTING is off. The flag is read on each request, so this page is never prerendered.
 */
import type { Metadata } from "next";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScreenView } from "@/components/screen-view";
import { SocialLinkPanel } from "@/components/social-link-panel";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { socialVotingOn } from "@/lib/social-voting/env";

export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  // While the page 404s, it claims no title of its own: it carries the not-found title.
  if (!isLocale(locale) || !socialVotingOn()) return notFoundMetadata(locale);
  return { title: getDictionary(locale).meta.socialTitle, robots: { index: false } };
}

export default async function SocialLinkPage({ params, searchParams }: { params: Params; searchParams: Promise<{ result?: string | string[] }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || !socialVotingOn()) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const { result } = await searchParams;
  // Only a result code this page knows is ever shown; anything else in the address is ignored.
  const known = typeof result === "string" && Object.hasOwn(t.socialLink.result, result) ? (result as keyof typeof t.socialLink.result) : null;

  return (
    <div className="mx-auto grid w-full max-w-[640px] gap-8 py-4 sm:py-8">
      <ScreenView locale={locale} screen="socialLink" />
      <header className="grid gap-3">
        <h1 className="m-0 font-display text-headline font-bold tracking-tight text-balance">{t.socialLink.title}</h1>
        <p className="m-0 text-body-lg text-ink-2">{t.socialLink.intro}</p>
      </header>

      <SocialLinkPanel locale={locale} t={t.socialLink} result={known} />

      <section aria-labelledby="social-how" className="grid gap-3 border-t border-line pt-5">
        <h2 id="social-how" className="m-0 font-display text-title-sm font-bold">
          {t.socialLink.howTitle}
        </h2>
        <ul className="m-0 grid list-disc gap-2 pl-5 text-body-sm text-ink-2">
          {Object.entries(t.socialLink.how).map(([key, line]) => (
            <li key={key}>{line}</li>
          ))}
        </ul>
      </section>

      <div className="grid gap-3">
        <Link href={`/${locale}/record`} className="justify-self-start text-body-sm font-semibold text-link underline underline-offset-4">
          {t.socialLink.back}
        </Link>
        <p className="m-0 text-caption text-ink-2">{t.legal.footer}</p>
      </div>
    </div>
  );
}
