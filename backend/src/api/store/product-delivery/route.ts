import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Public catalogue estimate: no cart creation, admin token or private provider data.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const id = req.query.product_id
  if (typeof id !== "string" || !/^prod_[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    return res.status(400).json({ code: "INVALID_PRODUCT" })
  }
  try {
    const channels = req.publishable_key_context?.sales_channel_ids ?? []
    if (!channels.length) return res.status(404).json({ code: "PRODUCT_NOT_FOUND" })
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: products } = await query.graph({ entity: "product", fields: ["id", "status", "sales_channels.id", "shipping_profile.id"], filters: { id, status: "published" } }, { cache: { enable: false } })
    const product = products[0]
    const productChannels = product?.sales_channels?.flatMap(channel => channel && channels.includes(channel.id) ? [channel.id] : []) ?? []
    if (!product || product.status !== "published" || !productChannels.length) return res.status(404).json({ code: "PRODUCT_NOT_FOUND" })
    const empty = { options: [], requires_checkout: true }
    if (!product.shipping_profile?.id) return res.json(empty)
    const profileId = product.shipping_profile.id
    const { data: regions } = await query.graph({ entity: "region", fields: ["id", "currency_code", "countries.iso_2"] }, { cache: { enable: false } })
    const region = regions.find(region => region.countries?.some(country => country?.iso_2 === "rs"))
    if (!region) return res.json(empty)
    const { data: salesChannels } = await query.graph({ entity: "sales_channels", filters: { id: productChannels }, fields: ["stock_locations.fulfillment_sets.id"] }, { cache: { enable: false } })
    const setIds = [...new Set(salesChannels.flatMap(channel => channel.stock_locations?.flatMap(location => location?.fulfillment_sets?.flatMap(set => set ? [set.id] : []) ?? []) ?? []))]
    if (!setIds.length) return res.json(empty)
    // Same context-aware fulfillment and pricing query as Medusa's Store shipping-options workflow.
    const remoteQuery = req.scope.resolve(ContainerRegistrationKeys.REMOTE_QUERY)
    const methods = await remoteQuery({ entryPoint: "shipping_options",
      fields: ["id", "name", "price_type", "shipping_profile_id", "provider.is_enabled", "service_zone.fulfillment_set.type", "calculated_price.*"],
      variables: {
        context: { enabled_in_store: "true", is_return: "false" },
        filters: { fulfillment_set_id: setIds, fulfillment_set_type: "shipping", shipping_profile_id: profileId, address: { country_code: "rs" } },
        calculated_price: { context: { currency_code: region.currency_code, region_id: region.id } },
      },
    }, { cache: { enable: false } })
    const available = methods.filter(method => method.provider?.is_enabled === true && method.service_zone?.fulfillment_set?.type === "shipping" && method.shipping_profile_id === profileId)
    const options = available.flatMap(method => {
      const amount = method.calculated_price?.calculated_amount
      if (method.price_type !== "flat" || typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return []
      return [{ id: method.id, name: method.name, amount, currency_code: region.currency_code }]
    })
    return res.json({ options, requires_checkout: !options.length || options.length !== available.length })
  } catch {
    return res.status(503).json({ code: "DELIVERY_UNAVAILABLE" })
  }
}
