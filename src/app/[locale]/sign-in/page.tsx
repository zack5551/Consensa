/*
 * Screen: sign in.
 * One message: no password, just a link by email.
 * One action: send me a link.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScreenView } from "@/components/screen-view";
import { SignInForm } from "@/components/sign-in-form";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: getDictionary(locale).signIn.title,
    robots: { index: false },
    alternates: { languages: { "en-CA": "/en/sign-in", "fr-CA": "/fr/sign-in" } },
  };
}

export default async function SignInPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ link?: string }> }) {
  const { locale: raw } = await params;
  const { link } = await searchParams;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);

  return (
    <div className="mx-auto grid w-full max-w-[440px] gap-6 py-4 sm:py-12">
      <ScreenView locale={locale} screen="signIn" />
      <header className="grid gap-3">
        <h1 className="m-0 font-display text-headline font-bold tracking-tight text-balance">{t.signIn.title}</h1>
        <p className="m-0 text-body-lg text-ink-2">{t.signIn.body}</p>
      </header>
      <div className="rounded-card border border-line border-t-4 border-t-ink bg-surface p-5 sm:p-6">
        <SignInForm locale={locale} t={t.signIn} expired={link === "expired"} />
      </div>
      <p className="m-0 text-caption text-ink-2">{t.legal.footer}</p>
    </div>
  );
}
