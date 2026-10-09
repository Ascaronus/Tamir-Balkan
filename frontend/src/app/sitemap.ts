import type { MetadataRoute } from "next"
import { listProductsByCountry } from "@/lib/store/products"
import { listStoreProductCategories } from "@/lib/store/categories"
import { siteUrl } from "@/lib/seo"

export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = ["/", "/cookies", "/privacy", "/terms"].map(path => ({ url: siteUrl(path) }))
  const seen = new Set<string>()
  let totalProducts = 0
  for (let offset = 0; ; offset += 100) {
    const { products, count } = await listProductsByCountry({ countryCode: "rs", limit: 100, offset })
    totalProducts = count
    for (const product of products) {
      if (!product.handle || seen.has(product.handle)) continue
      seen.add(product.handle)
      const updatedAt = product.updated_at ? new Date(product.updated_at) : null
      entries.push({
        url: siteUrl("/rs/products/" + encodeURIComponent(product.handle)),
        ...(updatedAt && Number.isFinite(updatedAt.getTime())
          ? { lastModified: updatedAt }
          : {}),
      })
    }
    if (!products.length || offset + products.length >= count) break
  }
  for (let page = 2; page <= Math.ceil(totalProducts / 24); page++) entries.push({ url: siteUrl(`/rs/catalog?page=${page}`) })
  // Categories are distinct canonical landing pages. Empty ones are noindex until products are published.
  const categories = await listStoreProductCategories("sr")
  const unique = new Map<string, (typeof categories)[number]>()
  function walk(items: typeof categories) { for (const category of items) { if (unique.has(category.id)) continue; unique.set(category.id, category); walk(category.category_children ?? []) } }
  walk(categories)
  const populated = await Promise.all([...unique.values()].map(async category => ({ category,
    count: (await listProductsByCountry({ countryCode: "rs", categoryId: category.id, limit: 1 })).count,
  })))
  for (const { category, count } of populated) {
    if (!count) continue
    const path = `/rs/catalog?category_id=${encodeURIComponent(category.id)}`
    entries.push({ url: siteUrl(path) })
    for (let page = 2; page <= Math.ceil(count / 24); page++) entries.push({ url: siteUrl(`${path}&page=${page}`) })
  }
  // Next 16's sitemap serializer interpolates item.url directly into XML.
  // Escape query separators here; the parsed <loc> still contains the canonical URL.
  return entries.map(entry => ({ ...entry, url: entry.url.replace(/&/g, "&amp;") }))
}
