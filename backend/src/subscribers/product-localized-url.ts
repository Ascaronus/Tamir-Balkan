import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { syncProductUrl } from "../utils/product-urls"

export default async function productLocalizedUrl({ event, container }: SubscriberArgs<{ id: string }>) {
  if (!event.data.id) return
  if (event.name.startsWith("translation.")) {
    const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const translation = await db("translation").where({ id: event.data.id }).first()
    if (translation?.reference !== "product" || translation.locale_code !== "en") return
    await syncProductUrl(container, translation.reference_id)
  } else await syncProductUrl(container, event.data.id)
}
export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "translation.created", "translation.updated", "translation.deleted"],
  context: { subscriberId: "tamir-product-localized-url" },
}
