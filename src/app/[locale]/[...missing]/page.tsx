/*
 * Any unknown path under a locale (/fr/nimporte-quoi) renders the bilingual not-found screen inside the
 * app shell, with a real 404 status, instead of Next.js's unbranded default.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { notFoundMetadata } from "@/lib/not-found-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return notFoundMetadata((await params).locale);
}

export default function Missing(): never {
  notFound();
}
