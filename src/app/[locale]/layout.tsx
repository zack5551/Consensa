import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LocaleSwitch } from "@/components/locale-switch";
import { Wordmark } from "@/components/wordmark";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import "@/styles/globals.css";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    title: { default: t.meta.title, template: `%s · Consensa` },
    description: t.meta.description,
    alternates: { languages: { "en-CA": "/en", "fr-CA": "/fr" } },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1626" },
  ],
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);

  return (
    <html lang={`${locale}-CA`} className={`${manrope.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-surface focus:p-3">
          {t.nav.skipToContent}
        </a>
        <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-4 px-4">
            <Link href={`/${locale}`} aria-label="consensa">
              <Wordmark />
            </Link>
            <LocaleSwitch locale={locale} label={t.nav.language} switchTo={t.nav.switchTo} />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1120px] px-4 pb-12 pt-6">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto grid max-w-[1120px] gap-1 px-4 py-6 text-1 text-ink-2">
            <p className="m-0 font-semibold text-ink">{t.legal.footer}</p>
            <p className="m-0">{t.legal.noValue}</p>
            <p className="m-0">{t.legal.sample}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
