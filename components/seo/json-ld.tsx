/**
 * schema.org data for search engines. Rendered into the page as a
 * <script type="application/ld+json">; `<` is escaped so page text can never
 * close the tag early.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }} />;
}
