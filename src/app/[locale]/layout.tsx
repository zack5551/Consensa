import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { OfflineNotice } from "@/components/shell/offline-notice";
import { TabBar } from "@/components/shell/primary-nav";
import { ShellProvider } from "@/components/shell/shell-context";
import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { themeBootScript } from "@/components/shell/theme";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { inter, manrope } from "@/styles/fonts";
import "@/styles/globals.css";


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
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    openGraph: {
      type: "website",
      siteName: "Consensa",
      locale: `${locale}_CA`,
      title: t.meta.title,
      description: t.meta.description,
      images: [{ url: `/og/${locale}.png`, width: 1200, height: 630, alt: t.meta.title }],
    },
    twitter: { card: "summary_large_image", title: t.meta.title, description: t.meta.description, images: [`/og/${locale}.png`] },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF8F5" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1324" },
  ],
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);

  return (
    <html lang={`${locale}-CA`} className={`${manrope.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies a saved light/dark choice before first paint. Inline, first-party, no network. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:p-3 focus:shadow-card">
          {t.nav.skipToContent}
        </a>
        <SiteHeader locale={locale} t={t} />
        <OfflineNotice message={t.status.offline} />
        <ShellProvider value={{ locale, status: t.status, notFound: t.notFound }}>
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-12 pt-6 outline-none">
            {children}
          </main>
        </ShellProvider>
        {/* Room for the phone tab bar so the footer is never hidden behind it. */}
        <div className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <SiteFooter locale={locale} t={t} />
        </div>
        <TabBar
          locale={locale}
          navLabel={t.nav.phone}
          labels={t.nav.short}
        />
      </body>
    </html>
  );
}
