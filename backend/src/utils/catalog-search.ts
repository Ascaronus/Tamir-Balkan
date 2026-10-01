import type { ITranslationModuleService } from "@medusajs/types/dist/translation/service"

export const catalogSearchFields = ["title", "subtitle", "description", "handle", "metadata", "variants.title", "variants.sku", "variants.ean", "variants.upc"]
type SearchProduct = {
  id: string; title?: string | null; subtitle?: string | null; description?: string | null; handle?: string | null
  metadata?: Record<string, unknown> | null
  variants?: ({ title?: string | null; sku?: string | null; ean?: string | null; upc?: string | null } | null)[] | null
}
const textFields = ["title", "subtitle", "description"] as const
function textValues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  return textFields.flatMap(field => {
    const text = (value as Record<string, unknown>)[field]
    return typeof text === "string" ? [text] : []
  })
}
function storefrontLocale(locale: string) { return /^(sr|en)(-|$)/i.test(locale) }
export function normalizeCatalogSearch(value: string): string {
  return value.toLowerCase().replace(/đ/g, "dj").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim()
}

/** Search only public product copy; never arbitrary metadata or JSON keys. */
export async function searchCatalogProducts<T extends SearchProduct>(products: T[], search: string,
  translation: Pick<ITranslationModuleService, "listTranslations">): Promise<T[]> {
  if (!products.length) return []
  const terms = normalizeCatalogSearch(search).split(" ").filter(Boolean)
  if (!terms.length) return products
  const translated = new Map<string, string[]>()
  const ids = products.map(product => product.id)
  const allowedIds = new Set(ids)
  // Pagination is independent of the catalog page: a match may be in any batch.
  for (let skip = 0; ; skip += 200) {
    const rows = await translation.listTranslations({ reference: "product", reference_id: ids },
      { select: ["reference_id", "locale_code", "translations"], take: 200, skip, order: { id: "ASC" } })
    for (const row of rows) {
      if (!allowedIds.has(row.reference_id) || !storefrontLocale(row.locale_code)) continue
      translated.set(row.reference_id, [...(translated.get(row.reference_id) ?? []), ...textValues(row.translations)])
    }
    if (rows.length < 200) break
  }
  return products.filter(product => {
    const texts = [...textValues(product), product.handle ?? "", ...(translated.get(product.id) ?? [])]
    const i18n = product.metadata?.i18n
    if (i18n && typeof i18n === "object" && !Array.isArray(i18n)) {
      for (const [locale, fields] of Object.entries(i18n)) if (storefrontLocale(locale)) texts.push(...textValues(fields))
    }
    for (const variant of product.variants ?? []) {
      if (!variant) continue
      for (const key of ["title", "sku", "ean", "upc"] as const) if (typeof variant[key] === "string") texts.push(variant[key])
    }
    const haystack = normalizeCatalogSearch(texts.join(" "))
    return terms.every(term => haystack.includes(term))
  })
}
