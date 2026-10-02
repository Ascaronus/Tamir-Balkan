import type { ITranslationModuleService } from "@medusajs/types/dist/translation/service"
import type { CatalogProduct } from "./catalog"

type Facet = { value: string; label: string; count: number }
// Filter keys remain canonical across languages. Only the displayed labels change.
export async function localizeCatalogFacets<T extends { colors: Facet[]; sizes: Facet[] }>(
  filters: T, products: CatalogProduct[], locale: string | undefined,
  translation: Pick<ITranslationModuleService, "listTranslations">,
): Promise<T> {
  if (!locale) return filters
  const values = new Map<string, string>()
  for (const product of products) for (const variant of product.variants ?? []) {
    for (const option of variant.options ?? []) if (option.id) values.set(option.id, option.value)
  }
  const ids = [...values.keys()]
  const labels = new Map<string, { value: string; rank: number }>()
  const locales = [...new Set([locale, locale.split("-")[0]])]
  for (let start = 0; start < ids.length; start += 200) {
    const chunk = ids.slice(start, start + 200)
    for (let skip = 0; ; skip += 200) {
      const rows = await translation.listTranslations({ reference: "product_option_value", reference_id: chunk, locale_code: locales },
        { select: ["reference_id", "locale_code", "translations"], take: 200, skip, order: { id: "ASC" } })
      for (const row of rows) {
        const original = values.get(row.reference_id)?.trim().toLowerCase()
        const label = row.translations?.value
        const rank = locales.indexOf(row.locale_code)
        if (!original || rank < 0 || typeof label !== "string" || !label.trim()) continue
        if (!labels.has(original) || rank < labels.get(original)!.rank) labels.set(original, { value: label, rank })
      }
      if (rows.length < 200) break
    }
  }
  const translate = (items: Facet[]) => items.map(item => ({ ...item, label: labels.get(item.value)?.value ?? item.label }))
  return { ...filters, colors: translate(filters.colors), sizes: translate(filters.sizes) }
}
