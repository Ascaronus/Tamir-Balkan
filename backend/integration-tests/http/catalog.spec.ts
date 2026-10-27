import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  createProductsWorkflow,
  createRegionsWorkflow,
  createShippingProfilesWorkflow,
  createTaxRegionsWorkflow,
  updateStoresStep,
} from "@medusajs/medusa/core-flows"

import { productUrlSchema, syncProductUrl } from "../../src/utils/product-urls"

jest.setTimeout(120 * 1000)

// Тот же приём, что в src/scripts/add-balkan-regions.ts: валюты магазина
// подключаются через updateStoresStep. Имя рабочего процесса уникально,
// чтобы не сталкиваться со сценарными workflow в одном процессе Jest.
const updateStoreCurrenciesForCatalogTest = createWorkflow(
  "update-store-currencies-catalog-http-test",
  (input: {
    supported_currencies: { currency_code: string; is_default?: boolean }[]
    store_id: string
  }) => {
    const normalizedInput = transform({ input }, (data) => ({
      selector: { id: data.input.store_id },
      update: {
        supported_currencies: data.input.supported_currencies.map((currency) => ({
          currency_code: currency.currency_code,
          is_default: currency.is_default ?? false,
        })),
      },
    }))
    const stores = updateStoresStep(normalizedInput)
    return new WorkflowResponse(stores)
  }
)

const BASE_QUERY = "country_code=rs"

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("GET /store/catalog/products", () => {
      let fixtures: {
        regionId: string
        publishableKey: string
        teeId: string
        hoodieId: string
        draftProductId: string
        offChannelProductId: string
      }

      const catalogGet = (query: string) => api.get(`/store/catalog/products?${query}`, {
        headers: { "x-publishable-api-key": fixtures.publishableKey },
        validateStatus: () => true,
      })

      // medusaIntegrationTestRunner пересоздаёт схему перед каждым тестом,
      // поэтому фикстуры регистрируются во вложенном beforeEach — он
      // выполняется после служебного beforeEach раннера.
      beforeEach(async () => {
        const container = getContainer()
        // The runner resets the database between cases. Medusa migrations do not
        // include this custom schema; production installs it via setup-reviews.ts.
        // Install it before product workflows emit product.created events.
        await container.resolve(ContainerRegistrationKeys.PG_CONNECTION).raw(productUrlSchema)

        const [store] = await container.resolve(Modules.STORE).listStores()
        await updateStoreCurrenciesForCatalogTest(container).run({
          input: {
            store_id: store.id,
            supported_currencies: [{ currency_code: "eur", is_default: true }],
          },
        })

        const { result: [region] } = await createRegionsWorkflow(container).run({
          input: {
            regions: [{
              name: "Catalog HTTP Test Region",
              currency_code: "eur",
              countries: ["rs"],
              payment_providers: ["pp_system_default"],
            }],
          },
        })
        await createTaxRegionsWorkflow(container).run({
          input: [{ country_code: "rs", provider_id: "tp_system" }],
        })

        const { result: [shippingProfile] } = await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "default", type: "default" }] },
        })

        // Default Sales Channel и publishable key создаёт createDefaultsWorkflow
        // (app loader в beforeAll и beforeEach раннера).
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
        // ensure-publishable-api-key middleware ищет ключ по token (pk_...), а не по id (apk_...)
        const { data: keys } = await query.graph({ entity: "api_key", fields: ["id", "token"], filters: { type: "publishable" } })
        const channel = channels[0]
        const publishableKey = keys[0].token

        const linked = { sales_channels: [{ id: channel.id }], shipping_profile_id: shippingProfile.id }
        const { result: [tee, hoodie, draftProduct, offChannelProduct] } = await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: "Catalog Test Tee",
                handle: "catalog-test-tee",
                status: ProductStatus.PUBLISHED,
                ...linked,
                options: [
                  { title: "Size", values: ["S", "M"] },
                  { title: "Color", values: ["Black"] },
                ],
                variants: [
                  { title: "S / Black", sku: "CATALOG-TEST-TEE-S-BLACK", options: { Size: "S", Color: "Black" },
                    prices: [{ amount: 2500, currency_code: "eur" }] },
                  { title: "M / Black", sku: "CATALOG-TEST-TEE-M-BLACK", options: { Size: "M", Color: "Black" },
                    prices: [{ amount: 4000, currency_code: "eur" }] },
                ],
              },
              {
                title: "Catalog Test Hoodie",
                handle: "catalog-test-hoodie",
                status: ProductStatus.PUBLISHED,
                ...linked,
                options: [
                  { title: "Size", values: ["M"] },
                  { title: "Color", values: ["Gray"] },
                ],
                variants: [
                  { title: "M / Gray", sku: "CATALOG-TEST-HOODIE-M-GRAY", options: { Size: "M", Color: "Gray" },
                    prices: [{ amount: 7000, currency_code: "eur" }] },
                ],
              },
              {
                // draft вне выдачи каталога (applyDefaultFilters status=PUBLISHED)
                title: "Catalog Test Draft Product",
                handle: "catalog-test-draft-product",
                status: ProductStatus.DRAFT,
                ...linked,
                options: [{ title: "Size", values: ["M"] }],
                variants: [
                  { title: "M", sku: "CATALOG-TEST-DRAFT-M", options: { Size: "M" },
                    prices: [{ amount: 100, currency_code: "eur" }] },
                ],
              },
              {
                // published, но не привязан к sales channel publishable-ключа
                title: "Catalog Test Off Channel Product",
                handle: "catalog-test-off-channel-product",
                status: ProductStatus.PUBLISHED,
                shipping_profile_id: shippingProfile.id,
                options: [{ title: "Size", values: ["M"] }],
                variants: [
                  { title: "M", sku: "CATALOG-TEST-OFF-CHANNEL-M", options: { Size: "M" },
                    prices: [{ amount: 9900, currency_code: "eur" }] },
                ],
              },
            ],
          },
        })

        fixtures = {
          regionId: region.id,
          publishableKey,
          teeId: tee.id,
          hoodieId: hoodie.id,
          draftProductId: draftProduct.id,
          offChannelProductId: offChannelProduct.id,
        }
      })

      it("custom URL schema supports the product-created handler after a database reset", async () => {
        const container = getContainer()
        const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
        const result = await syncProductUrl(container, fixtures.teeId, "catalog-test-english-tee")
        expect(result?.handle).toEqual("catalog-test-english-tee")
        const alias = await db("tamir_product_url").where({ product_id: fixtures.teeId, is_current: true }).first()
        expect(alias.handle).toEqual("catalog-test-english-tee")
        const product = await db("product").where({ id: fixtures.teeId }).first()
        expect(product.metadata.en_handle).toEqual("catalog-test-english-tee")
      })

      it("возвращает опубликованные товары sales channel с ценой и налогом региона", async () => {
        const response = await catalogGet(`region_id=${fixtures.regionId}&${BASE_QUERY}`)
        expect(response.status).toEqual(200)
        expect(response.headers["cache-control"]).toEqual("private, no-store")

        const body = response.data
        expect(body.currency_code).toEqual("eur")
        expect(body.count).toEqual(2)
        expect(body.offset).toEqual(0)
        expect(body.limit).toEqual(24)
        expect(body.sort).toEqual("newest")
        expect(body.sort_options).toEqual(["newest", "price_asc", "price_desc", "popularity"])
        expect(body.applied_filters).toEqual({ size: [], color: [], min_price: null, max_price: null })

        const returnedIds = new Set(body.products.map((product: any) => product.id))
        expect(returnedIds).toEqual(new Set([fixtures.teeId, fixtures.hoodieId]))
        expect(returnedIds.has(fixtures.draftProductId)).toBe(false)
        expect(returnedIds.has(fixtures.offChannelProductId)).toBe(false)

        const tee = body.products.find((product: any) => product.id === fixtures.teeId)
        expect(tee.title).toEqual("Catalog Test Tee")
        expect(tee.handle).toEqual("catalog-test-tee")
        expect(tee.variants).toHaveLength(2)
        for (const variant of tee.variants) {
          expect(typeof variant.calculated_price.calculated_amount).toEqual("number")
          // Налоговых ставок в фикстурах нет (VAT 0%), но wrapProductsWithTaxPrices
          // обязан проставить обе налоговые суммы при taxContext региона.
          expect(variant.calculated_price.calculated_amount_with_tax)
            .toEqual(variant.calculated_price.calculated_amount)
          expect(variant.calculated_price.calculated_amount_without_tax)
            .toEqual(variant.calculated_price.calculated_amount)
        }
        expect(tee.catalog.price).toEqual(2500)
        expect(tee.catalog.currency_code).toEqual("eur")
        expect(new Set(tee.catalog.matching_variant_ids))
          .toEqual(new Set(tee.variants.map((variant: any) => variant.id)))
        const cheapest = tee.variants.reduce((best: any, variant: any) =>
          variant.calculated_price.calculated_amount < best.calculated_price.calculated_amount ? variant : best)
        expect(tee.catalog.preferred_variant_id).toEqual(cheapest.id)

        expect(body.filters.sizes).toEqual([
          { value: "m", label: "M", count: 2 },
          { value: "s", label: "S", count: 1 },
        ])
        expect(body.filters.colors).toEqual([
          { value: "black", label: "Black", count: 1 },
          { value: "gray", label: "Gray", count: 1 },
        ])
        expect(body.filters.price).toEqual({ min: 2500, max: 7000, currency_code: "eur" })
      })

      it("фильтрует по размеру и цене, сортирует и ограничивает выдачу", async () => {
        const response = await catalogGet(
          `region_id=${fixtures.regionId}&${BASE_QUERY}&size=m&min_price=3000&max_price=8000&sort=price_asc&limit=1`
        )
        expect(response.status).toEqual(200)

        const body = response.data
        expect(body.count).toEqual(2)
        expect(body.products).toHaveLength(1)
        expect(body.products[0].title).toEqual("Catalog Test Tee")
        expect(body.products[0].catalog.price).toEqual(4000)
        expect(body.applied_filters).toEqual({ size: ["m"], color: [], min_price: 3000, max_price: 8000 })
        // Фасеты строятся по вариантам, прошедшим ценовой фильтр: S/Black (2500) отсекается.
        expect(body.filters.sizes).toEqual([{ value: "m", label: "M", count: 2 }])
        expect(body.filters.colors).toEqual([
          { value: "black", label: "Black", count: 1 },
          { value: "gray", label: "Gray", count: 1 },
        ])
        expect(body.limit).toEqual(1)
      })

      it("отдаёт 400 для региона, которого нет в ценовом контексте", async () => {
        const response = await catalogGet("region_id=reg-catalog-does-not-exist")
        expect(response.status).toEqual(400)
        expect(JSON.stringify(response.data)).toContain("not found when populating the pricing context")
      })

      describe("невалидные параметры", () => {
        const invalidCases: { query: string; message: string }[] = [
          { query: BASE_QUERY, message: "Invalid catalog parameter: region_id" },
          { query: "region_id=reg-catalog-any&limit=0", message: "Invalid catalog parameter: limit" },
          { query: "region_id=reg-catalog-any&limit=101", message: "Invalid catalog parameter: limit" },
          { query: "region_id=reg-catalog-any&sort=bogus", message: "Invalid catalog parameter: sort" },
          { query: "region_id=reg-catalog-any&min_price=500&max_price=100", message: "Invalid catalog parameter: min_price > max_price" },
          { query: "region_id=reg-catalog-any&fields=id", message: "Invalid catalog parameter: fields" },
        ]
        it.each(invalidCases)("400 INVALID_CATALOG_QUERY: $query", async (testCase) => {
          const response = await catalogGet(testCase.query)
          expect(response.status).toEqual(400)
          expect(response.data).toEqual({ code: "INVALID_CATALOG_QUERY", message: testCase.message })
        })
      })
    })
  },
})
