import type { MetadataRoute } from "next"
import { listProductsByCountry } from "@/lib/store/products"
import { listStoreProductCategories } from "@/lib/store/categories"
import { categoryPath } from "@/lib/store/category-url"
import { localizedPath, productPath, englishReady } from "@/lib/i18n/paths"
import { siteUrl } from "@/lib/seo"

export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = []
  function pair(srPath: string, enPath = localizedPath(srPath, "en"), lastModified?: Date) {
    const languages = { sr: siteUrl(srPath), en: siteUrl(enPath) }
    for (const url of [languages.sr, languages.en]) entries.push({ url, alternates: { languages }, ...(lastModified ? { lastModified } : {}) })
  }
  for (const path of ["/", "/cookies", "/privacy", "/terms"]) pair(path)
  const seen = new Set<string>()
  let totalProducts = 0
  for (let offset = 0; ; offset += 100) {
    const { products, count } = await listProductsByCountry({ countryCode: "rs", locale: "sr", limit: 100, offset })
    totalProducts = count
    for (const product of products) {
      if (!product.handle || seen.has(product.handle)) continue
      seen.add(product.handle)
      const date = product.updated_at ? new Date(product.updated_at) : null
      const lastModified = date && Number.isFinite(date.getTime()) ? date : undefined
      if (englishReady(product)) pair(productPath(product, "sr"), productPath(product, "en"), lastModified)
      else entries.push({ url: siteUrl(productPath(product, "sr")), ...(lastModified ? { lastModified } : {}) })
    }
    if (!products.length || offset + products.length >= count) break
  }
  for (let page = 2; page <= Math.ceil(totalProducts / 24); page++) pair(`/rs/catalog?page=${page}`)
  const categories = await listStoreProductCategories("sr")
  const unique = new Map<string, (typeof categories)[number]>()
  function walk(items: typeof categories) { for (const category of items) { if (unique.has(category.id)) continue; unique.set(category.id, category); walk(category.category_children ?? []) } }
  walk(categories)
  const populated = await Promise.all([...unique.values()].map(async category => ({ category,
    count: (await listProductsByCountry({ countryCode: "rs", locale: "sr", categoryId: category.id, limit: 1 })).count,
  })))
  for (const { category, count } of populated) {
    if (!count) continue
    const path = categoryPath(category)
    pair(path)
    for (let page = 2; page <= Math.ceil(count / 24); page++) pair(`${path}${path.includes("?") ? "&" : "?"}page=${page}`)
  }
  // Next 16 interpolates both <loc> and alternate href directly into XML.
  const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
  return entries.map(entry => ({ ...entry, url: xml(entry.url), ...(entry.alternates?.languages ? {
    alternates: { languages: Object.fromEntries(Object.entries(entry.alternates.languages).map(([key, value]) => [key, xml(String(value))])) },
  } : {}) }))
}
