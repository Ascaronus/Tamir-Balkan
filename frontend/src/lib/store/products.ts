import { medusaStoreLocale, type Locale } from "@/lib/i18n/config"
import { sdk } from "@/lib/medusa"
import { getRegionByCountry } from "@/lib/store/regions"
import type { HttpTypes } from "@medusajs/types"

const PRODUCT_FIELDS =
  "*images,*options,*options.values,*variants,*variants.options,*variants.options.option,*variants.calculated_price,+variants.inventory_quantity,*variants.images,+metadata"

export async function listProductsByCountry(params: {
  countryCode: string
  locale?: Locale
  q?: string
  limit?: number
  offset?: number
  handle?: string
  /** Фильтр по категории (как в админке: Product → Categories). */
  categoryId?: string
}): Promise<{ products: HttpTypes.StoreProduct[]; count: number }> {
  const { countryCode, limit = 24, offset = 0, handle, categoryId, locale, q } = params

  const region = await getRegionByCountry(countryCode)
  if (!region) return { products: [], count: 0 }

  const query: Record<string, unknown> = {
    limit,
    offset,
    order: "created_at",
    region_id: region.id,
    fields: PRODUCT_FIELDS,
  }

  if (q) query.q = q
  if (handle) query.handle = handle
  if (categoryId) query.category_id = categoryId

  const res = await sdk.client.fetch<{
    products: HttpTypes.StoreProduct[]
    count: number
  }>(`/store/products`, {
    method: "GET",
    query,
    headers: locale ? { "x-medusa-locale": medusaStoreLocale(locale) } : undefined,
    // Важно: иначе изменения из админки могут не появляться на витрине.
    cache: "no-store",
  })

  return res
}

