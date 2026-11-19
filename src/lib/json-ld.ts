/** A schema.org node. The context is a vocabulary name, not a network call. */
export function schemaOrg(type: string, fields: Record<string, unknown>): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": type, ...fields };
}

/** JSON for a <script type="application/ld+json">. `<` is escaped so text can never close the tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
