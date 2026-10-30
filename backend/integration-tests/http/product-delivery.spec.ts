import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

jest.setTimeout(120000)
medusaIntegrationTestRunner({ inApp: true, testSuite: ({ api, getContainer }) => {
  it("delivery HTTP reflects configured price changes, region pricing, store rules and product visibility", async () => {
    const container = getContainer(), query = container.resolve(ContainerRegistrationKeys.QUERY)
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    const fulfillment = container.resolve(Modules.FULFILLMENT), pricing = container.resolve(Modules.PRICING)
    const { data: keys } = await query.graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
    const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
    // Module fixtures avoid background product-workflow subscribers.
    const region = await container.resolve(Modules.REGION).createRegions({ name: "Serbia delivery test", currency_code: "rsd", countries: ["rs"] })
    const product = await container.resolve(Modules.PRODUCT).createProducts({ title: "Delivery test", handle: "delivery-test", status: "published" })
    const profile = await fulfillment.createShippingProfiles({ name: "Delivery test", type: "default" })
    const location = await container.resolve(Modules.STOCK_LOCATION).createStockLocations({ name: "Delivery test" })
    const set = await fulfillment.createFulfillmentSets({ name: "Delivery test", type: "shipping", service_zones: [{ name: "Serbia", geo_zones: [{ type: "country", country_code: "rs" }] }] })
    await link.create([
      { [Modules.PRODUCT]: { product_id: product.id }, [Modules.SALES_CHANNEL]: { sales_channel_id: channels[0].id } },
      { [Modules.PRODUCT]: { product_id: product.id }, [Modules.FULFILLMENT]: { shipping_profile_id: profile.id } },
      { [Modules.STOCK_LOCATION]: { stock_location_id: location.id }, [Modules.SALES_CHANNEL]: { sales_channel_id: channels[0].id } },
      { [Modules.STOCK_LOCATION]: { stock_location_id: location.id }, [Modules.FULFILLMENT]: { fulfillment_set_id: set.id } },
    ])
    const option = await fulfillment.createShippingOptions({ name: "Standard", price_type: "flat", provider_id: "manual_manual", service_zone_id: set.service_zones[0].id, shipping_profile_id: profile.id,
      type: { label: "Standard", code: "standard", description: "Standard" },
      rules: [{ attribute: "enabled_in_store", operator: "eq", value: "true" }, { attribute: "is_return", operator: "eq", value: "false" }],
    })
    const priceSet = await pricing.createPriceSets({ prices: [{ amount: 300, currency_code: "rsd" }, { amount: 0, currency_code: "rsd", rules: { region_id: region.id } }] })
    await link.create({ [Modules.FULFILLMENT]: { shipping_option_id: option.id }, [Modules.PRICING]: { price_set_id: priceSet.id } })
    const config = { headers: { "x-publishable-api-key": keys[0].token }, validateStatus: () => true }
    const get = () => api.get(`/store/product-delivery?product_id=${product.id}`, config)
    const free = await get(); expect(free.status).toBe(200); expect(free.data.options).toEqual([{ id: option.id, name: "Standard", amount: 0, currency_code: "rsd" }])
    expect(free.headers["cache-control"]).toBe("no-store")
    await pricing.updatePriceSets(priceSet.id, { prices: [{ amount: 300, currency_code: "rsd" }, { amount: 450, currency_code: "rsd", rules: { region_id: region.id } }] })
    expect((await get()).data.options[0].amount).toBe(450)
    await fulfillment.updateShippingOptions(option.id, { rules: [{ attribute: "enabled_in_store", operator: "eq", value: "false" }] })
    expect((await get()).data.options).toEqual([])
    await container.resolve(Modules.PRODUCT).updateProducts(product.id, { status: "draft" })
    expect((await get()).status).toBe(404)
  })
} })
