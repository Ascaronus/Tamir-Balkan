import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { syncCategoryLocalization } from "../utils/category-localization"

export default async function categoryLocalizedUrl({ event, container }: SubscriberArgs<{ id: string }>) {
  if (!event.data.id) return
  if (event.name.startsWith("translation.")) {
    const row = await container.resolve(ContainerRegistrationKeys.PG_CONNECTION)("translation").where({ id: event.data.id }).first()
    if (row?.reference === "product_category") await syncCategoryLocalization(container, row.reference_id)
  } else await syncCategoryLocalization(container, event.data.id, event.name.endsWith(".created"))
}
export const config: SubscriberConfig = {
  event: ["product-category.created", "product-category.updated", "translation.created", "translation.updated"],
  context: { subscriberId: "tamir-category-localized-url" },
}
