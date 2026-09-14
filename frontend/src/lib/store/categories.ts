import { localizedText } from "@/lib/i18n/content"
import { sdk } from "@/lib/medusa"
import { medusaStoreLocale, type Locale } from "@/lib/i18n/config"
import type { HttpTypes } from "@medusajs/types"

const CATEGORY_FIELDS =
  "id,name,handle,metadata,parent_category_id,rank,*category_children"

function localeHeaders(locale?: Locale) {
  if (!locale) return undefined
  return { "x-medusa-locale": medusaStoreLocale(locale) }
}

/** Категории витрины (как в админке → Product Categories). */
export async function listStoreProductCategories(
  locale?: Locale
): Promise<HttpTypes.StoreProductCategory[]> {
  const all: HttpTypes.StoreProductCategory[] = []
  let offset = 0
  for (;;) {
    const result = await sdk.client.fetch<{ product_categories: HttpTypes.StoreProductCategory[]; count: number }>("/store/product-categories", {
      method: "GET", query: { limit: 100, offset, fields: CATEGORY_FIELDS }, headers: localeHeaders(locale), cache: "no-store",
    })
    all.push(...result.product_categories)
    offset += result.product_categories.length
    if (offset >= result.count || result.product_categories.length === 0) break
  }
  const translate = (cat: HttpTypes.StoreProductCategory): HttpTypes.StoreProductCategory => ({ ...cat, name: localizedText(cat, "name", cat.name, locale ?? "sr"), category_children: cat.category_children?.map(translate) })
  return all.map(translate)
}

export async function getStoreProductCategoryById(
  id: string,
  locale?: Locale
): Promise<HttpTypes.StoreProductCategory | null> {
  const { product_categories } = await sdk.client.fetch<{
    product_categories: HttpTypes.StoreProductCategory[]
  }>(`/store/product-categories`, {
    method: "GET",
    query: {
      id: [id],
      limit: 1,
      fields: "id,name,handle,metadata",
    },
    headers: localeHeaders(locale),
    cache: "no-store",
  })

  const category = product_categories?.[0]
  return category ? { ...category, name: localizedText(category, "name", category.name, locale ?? "sr") } : null
}
