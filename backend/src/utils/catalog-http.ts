import { authenticate, applyDefaultFilters, clearFiltersByKey, maybeApplyLinkFilter, validateAndTransformQuery,
  type MedusaNextFunction, type MedusaResponse } from "@medusajs/framework/http"
import { ProductStatus } from "@medusajs/framework/utils"
import { StoreGetProductsParams } from "@medusajs/medusa/api/store/products/validators"
import { defaultStoreProductFields } from "@medusajs/medusa/api/store/products/query-config"
import { filterByValidSalesChannels, normalizeDataForContext, setPricingContext, setTaxContext } from "@medusajs/medusa/api/utils/middlewares/index"
import type { RequestWithContext } from "@medusajs/medusa/api/store/products/helpers"
import { CatalogInputError, parseCatalogInput, type CatalogInput } from "./catalog"

export type CatalogRequest = RequestWithContext<never> & { catalogInput: CatalogInput }
function prepareCatalogQuery(req: CatalogRequest, res: MedusaResponse, next: MedusaNextFunction) {
  try {
    req.catalogInput = parseCatalogInput(req.query)
    const { region_id, country_code, province, category_id, q } = req.catalogInput
    // Custom filters never reach Medusa's product selector. No user-supplied
    // fields, status, channel IDs or pricing context can bypass Store defaults.
    req.query = { region_id, ...(country_code ? { country_code } : {}), ...(province ? { province } : {}),
      ...(category_id ? { category_id } : {}), ...(q ? { q } : {}) }
    next()
  } catch (error) {
    if (error instanceof CatalogInputError) return res.status(400).json({ code: "INVALID_CATALOG_QUERY", message: error.message })
    next(error)
  }
}
export const catalogMiddlewares = [
  prepareCatalogQuery,
  authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true }),
  validateAndTransformQuery(StoreGetProductsParams, { isList: true, defaultLimit: 24,
    defaults: [...defaultStoreProductFields, "metadata", "variants.calculated_price.*", "variants.inventory_quantity", "variants.images.*"] }),
  filterByValidSalesChannels(),
  // Enforce links even when there is only one channel or index engine is enabled.
  maybeApplyLinkFilter({ entryPoint: "product_sales_channel", resourceId: "product_id", filterableField: "sales_channel_id" }),
  applyDefaultFilters({ status: ProductStatus.PUBLISHED, categories: filters => {
    const ids = filters.category_id ?? (filters.categories as { id?: string | string[] } | undefined)?.id
    delete filters.category_id
    return ids ? { id: ids, is_internal: false, is_active: true } : undefined
  } }),
  normalizeDataForContext(), setPricingContext(), setTaxContext(),
  clearFiltersByKey(["region_id", "country_code", "province", "cart_id"]),
]
