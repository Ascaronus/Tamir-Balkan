import type { Locale } from "../i18n/config"
import { localizedText } from "../i18n/content"
import { productPath, productHandle } from "../i18n/paths"

/** Google truncates meta descriptions long before 500 characters, and a stub note carries no search value. */
export const META_DESCRIPTION_MIN = 30
export const META_DESCRIPTION_MAX = 320

/** Prefer the merchant's Medusa category text; keep the storefront template as the fallback. */
export function categoryMetaDescription(category: { description?: string | null }, fallback: string): string {
  const text = typeof category.description === "string" ? category.description.replace(/\s+/g, " ").trim() : ""
  if (text.length < META_DESCRIPTION_MIN) return fallback
  if (text.length <= META_DESCRIPTION_MAX) return text
  const cut = text.slice(0, META_DESCRIPTION_MAX)
  const boundary = cut.lastIndexOf(" ")
  return boundary >= 160 ? cut.slice(0, boundary) : cut
}

/** Visible server-rendered intro paragraphs; React escapes the text, blank lines end a paragraph. */
export function categoryIntroParagraphs(description?: string | null): string[] {
  if (typeof description !== "string") return []
  return description.replace(/\r\n?/g, "\n").split(/\n{2,}/).map(paragraph => paragraph.trim()).filter(Boolean)
}

export type CategoryJsonLdInput = {
  name: string
  description?: string | null
  /** Absolute canonical URL of this category page in the requested locale. */
  url: string
  locale: Locale
  /** First-page products; canonical product URLs match the links the page itself renders. */
  products: Array<{ handle?: string | null; title?: string | null; metadata?: Record<string, unknown> | null }>
  breadcrumbNames: { home: string; catalog: string }
}

/**
 * CollectionPage + BreadcrumbList for category landings so Google can match the
 * crawled URL to the catalogue tree. The WebSite is inlined because the storefront
 * publishes no site-wide structured data. Empty pages pass no products and simply
 * lose the ItemList.
 *
 * Google validates every ListItem by `item` and `name`: a `url` key is ignored, and
 * Search Console then reports the whole page as "Missing field "item" (in
 * itemListElement)", which is exactly what the published markup used to do.
 */
export function categoryJsonLd(input: CategoryJsonLdInput) {
  const prefix = input.locale === "en" ? "/en" : "/rs"
  const absolute = (path: string) => new URL(path, input.url).href
  const items: Array<{ "@type": "ListItem"; position: number; name: string; item: string }> = []
  for (const product of input.products) {
    const handle = productHandle(product, input.locale)
    if (!handle) continue
    const name = localizedText(product, "title", product.title || "", input.locale).trim() || handle
    items.push({ "@type": "ListItem", position: items.length + 1, name, item: absolute(productPath(product, input.locale)) })
  }
  const description = typeof input.description === "string" ? input.description.replace(/\s+/g, " ").trim() : ""
  const collection = {
    "@context": "https://schema.org", "@type": "CollectionPage", "@id": input.url, url: input.url,
    name: input.name,
    ...(description ? { description } : {}),
    isPartOf: { "@type": "WebSite", name: "TAMIR", url: absolute(prefix) },
    ...(items.length ? { mainEntity: { "@type": "ItemList", numberOfItems: items.length, itemListElement: items } } : {}),
  }
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: input.breadcrumbNames.home, item: absolute(prefix) },
      { "@type": "ListItem", position: 2, name: input.breadcrumbNames.catalog, item: absolute(`${prefix}/catalog`) },
      { "@type": "ListItem", position: 3, name: input.name, item: input.url },
    ],
  }
  return [collection, breadcrumb]
}
