import { matchesCategoryHandle } from "./category-url"
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
  return all
}

async function getStoreProductCategory(
  selector: { id: string[] } | { handle: string[] },
  locale?: Locale
): Promise<HttpTypes.StoreProductCategory | null> {
  const { product_categories } = await sdk.client.fetch<{
    product_categories: HttpTypes.StoreProductCategory[]
  }>(`/store/product-categories`, {
    method: "GET",
    query: {
      ...selector,
      limit: 1,
      fields: "id,name,handle,metadata",
    },
    headers: localeHeaders(locale),
    cache: "no-store",
  })

  const category = product_categories?.[0]
  return category ?? null
}

export function getStoreProductCategoryById(id: string, locale?: Locale) {
  return getStoreProductCategory({ id: [id] }, locale)
}

export async function getStoreProductCategoryByHandle(handle: string, locale?: Locale) {
  const categories = await listStoreProductCategories(locale)
  return categories.find(category => matchesCategoryHandle(category, handle)) ?? null
}
