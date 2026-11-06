/*
 * Any unknown path under a locale (/fr/nimporte-quoi) renders the bilingual not-found screen inside the
 * app shell, with a real 404 status, instead of Next.js's unbranded default.
 */
import { notFound } from "next/navigation";

export default function Missing(): never {
  notFound();
}
