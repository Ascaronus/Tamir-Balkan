import type { MetadataRoute } from "next"
import { listProductsByCountry } from "@/lib/store/products"
import { siteUrl } from "@/lib/seo"

export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [{ url: siteUrl("/") }, { url: siteUrl("/cookies") }]
  const seen = new Set<string>()
  for (let offset = 0; ; offset += 100) {
    const { products, count } = await listProductsByCountry({ countryCode: "rs", limit: 100, offset })
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
  return entries
}
