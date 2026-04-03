import { sdk } from "@/lib/medusa"
import { getRegionByCountry } from "@/lib/store/regions"
import type { HttpTypes } from "@medusajs/types"

const PRODUCT_FIELDS =
  "*variants.calculated_price,+variants.inventory_quantity,*variants.images,+metadata,+tags,"

export async function listProductsByCountry(params: {
  countryCode: string
  limit?: number
  offset?: number
  handle?: string
  /** Фильтр по категории (как в админке: Product → Categories). */
  categoryId?: string
}): Promise<{ products: HttpTypes.StoreProduct[]; count: number }> {
  const { countryCode, limit = 24, offset = 0, handle, categoryId } = params

  const region = await getRegionByCountry(countryCode)
  if (!region) return { products: [], count: 0 }

  const query: Record<string, unknown> = {
    limit,
    offset,
    region_id: region.id,
    fields: PRODUCT_FIELDS,
  }

  if (handle) query.handle = handle
  if (categoryId) query.category_id = categoryId

  const res = await sdk.client.fetch<{
    products: HttpTypes.StoreProduct[]
    count: number
  }>(`/store/products`, {
    method: "GET",
    query,
    // Важно: иначе изменения из админки могут не появляться на витрине.
    cache: "no-store",
  })

  return res
}

