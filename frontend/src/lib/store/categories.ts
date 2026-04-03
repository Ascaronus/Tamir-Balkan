import { sdk } from "@/lib/medusa"
import type { HttpTypes } from "@medusajs/types"

const CATEGORY_FIELDS =
  "id,name,handle,parent_category_id,rank,*category_children"

/** Категории витрины (как в админке → Product Categories). */
export async function listStoreProductCategories(): Promise<
  HttpTypes.StoreProductCategory[]
> {
  const { product_categories } = await sdk.client.fetch<{
    product_categories: HttpTypes.StoreProductCategory[]
  }>(`/store/product-categories`, {
    method: "GET",
    query: {
      limit: 100,
      offset: 0,
      fields: CATEGORY_FIELDS,
    },
    cache: "no-store",
  })

  return product_categories ?? []
}

export async function getStoreProductCategoryById(
  id: string
): Promise<HttpTypes.StoreProductCategory | null> {
  const { product_categories } = await sdk.client.fetch<{
    product_categories: HttpTypes.StoreProductCategory[]
  }>(`/store/product-categories`, {
    method: "GET",
    query: {
      id: [id],
      limit: 1,
      fields: "id,name,handle",
    },
    cache: "no-store",
  })

  return product_categories?.[0] ?? null
}
