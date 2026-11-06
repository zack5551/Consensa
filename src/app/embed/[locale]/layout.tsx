import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isLocale, locales } from "@/i18n/config";
import { inter, manrope } from "@/styles/fonts";
import "@/styles/globals.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/** Bare root layout for the media embed widget: no header, nav or footer, so it fits inside a publisher's iframe. */
export default async function EmbedLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={`${locale}-CA`} className={`${manrope.variable} ${inter.variable}`}>
      <body className="bg-transparent p-2">{children}</body>
    </html>
  );
}
