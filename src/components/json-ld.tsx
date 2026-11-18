import { jsonLdString } from "@/lib/json-ld";

/** Server-rendered structured data for search engines. No visual output. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
