import type { MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules, QueryContext } from "@medusajs/framework/utils"
import { wrapProductsWithTaxPrices } from "@medusajs/medusa/api/store/products/helpers"
import { wrapVariantsWithInventoryQuantityForSalesChannel } from "@medusajs/medusa/api/utils/middlewares/index"
import { catalogSorts, selectCatalog, type CatalogProduct } from "../../../../utils/catalog"
import type { CatalogRequest } from "../../../../utils/catalog-http"
import type { ITranslationModuleService } from "@medusajs/types/dist/translation/service"
import { catalogSearchFields, searchCatalogProducts } from "../../../../utils/catalog-search"
import { catalogPopularity } from "../../../../utils/catalog-popularity"

import { localizeCatalogFacets } from "../../../../utils/catalog-translations"

const BATCH_SIZE = 200
// Explicit failure is safer than returning a partly filtered catalog. For a
// larger assortment replace candidate scans with a dedicated search index.
export const MAX_CATALOG_CANDIDATES = 10000
const scanFields = ["id", "created_at", "type_id", "options.id", "options.title",
  "variants.id", "variants.product_id", "variants.options.id", "variants.options.option_id", "variants.options.value", "variants.calculated_price.*"]

export async function GET(req: CatalogRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  const input = req.catalogInput
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const currency = req.pricingContext?.currency_code
  if (!currency) return res.status(400).json({ code: "CATALOG_REGION_REQUIRED", message: "A region with a currency is required" })
  const context = { variants: { calculated_price: QueryContext(req.pricingContext!) } }
  const options = { locale: req.locale, cache: { enable: false } }
  const candidates: CatalogProduct[] = []
  const translation = req.scope.resolve(Modules.TRANSLATION) as ITranslationModuleService
  // Search the original text plus translations; localize only the final response.
  const scanOptions = { cache: { enable: false } }
  const fields = input.q ? [...scanFields, ...catalogSearchFields] : scanFields
  let scanned = 0
  // Always graph, never estimated index counts. Only lightweight data is loaded
  // across the assortment; images, descriptions and stock are loaded for a page.
  for (let skip = 0; ; skip += BATCH_SIZE) {
    const { data, metadata } = await query.graph({ entity: "product", fields,
      filters: req.filterableFields, pagination: { skip, take: BATCH_SIZE, order: { id: "ASC" } }, context }, scanOptions)
    scanned += data.length
    if ((metadata?.count ?? 0) > MAX_CATALOG_CANDIDATES || scanned > MAX_CATALOG_CANDIDATES) {
      return res.status(503).json({ code: "CATALOG_SCOPE_TOO_LARGE", message: "Narrow the catalog by category or search" })
    }
    const matching = input.q ? await searchCatalogProducts(data, input.q, translation!) : data
    await wrapProductsWithTaxPrices(req, matching as any)
    candidates.push(...matching as unknown as CatalogProduct[])
    if (data.length < BATCH_SIZE || (metadata?.count !== undefined && skip + data.length >= metadata.count)) break
  }
  const popularity = input.sort === "popularity" ? await catalogPopularity(
    req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION), candidates.map(p => p.id),
    req.publishable_key_context.sales_channel_ids, input.region_id) : new Map<string, number>()
  const selected = selectCatalog(candidates, input, currency, popularity)
  const filters = await localizeCatalogFacets(selected.filters, candidates, req.locale, translation)
  let products: any[] = []
  if (selected.rows.length) {
    const ids = selected.rows.map(row => row.id)
    // IDs come only from the scoped scan; keep all native filters on the fetch.
    const allowedIds = req.filterableFields.id as string[] | undefined
    const pageIds = allowedIds ? ids.filter(id => allowedIds.includes(id)) : ids
    const result = await query.graph({ entity: "product",
      fields: req.queryConfig.fields.filter(field => !field.includes("variants.inventory_quantity")),
      filters: { ...req.filterableFields, id: pageIds }, pagination: { take: input.limit, skip: 0 }, context }, options)
    await wrapProductsWithTaxPrices(req, result.data as any)
    await wrapVariantsWithInventoryQuantityForSalesChannel(req, result.data.flatMap((p: any) => p.variants ?? []))
    const byId = new Map(result.data.map((p: any) => [p.id, p]))
    products = selected.rows.filter(row => byId.has(row.id)).map(row => ({ ...byId.get(row.id)!, catalog: {
      price: row.price, currency_code: currency, matching_variant_ids: row.matching_variant_ids, preferred_variant_id: row.preferred_variant_id,
    } }))
  }
  return res.json({ products, count: selected.count, offset: input.offset, limit: input.limit, sort: input.sort,
    currency_code: currency, sort_options: catalogSorts, filters,
    applied_filters: { size: input.size, color: input.color, min_price: input.min_price ?? null, max_price: input.max_price ?? null } })
}
