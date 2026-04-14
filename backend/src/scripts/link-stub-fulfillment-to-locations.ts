import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const STUB_PROVIDER_ID = "test_test"

/**
 * Одноразово: связать заглушку `test_test` со всеми складами, где её ещё нет.
 * Без этой связи в админке при выборе склада список «Поставщик фулфилмента» пустой
 * (фильтр GET /admin/fulfillment-providers?stock_location_id=…).
 *
 * Запуск: cd backend && npx medusa exec ./src/scripts/link-stub-fulfillment-to-locations.ts
 */
export default async function linkStubFulfillmentToLocations({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const stock = container.resolve(Modules.STOCK_LOCATION)

  const [locations] = await stock.listAndCountStockLocations({}, { take: 200 })
  let linked = 0

  for (const loc of locations) {
    const { data: rows } = await query.graph({
      entity: "location_fulfillment_provider",
      fields: ["fulfillment_provider_id"],
      filters: { stock_location_id: loc.id },
    })
    const hasStub = rows.some(
      (r: { fulfillment_provider_id?: string }) =>
        r.fulfillment_provider_id === STUB_PROVIDER_ID
    )
    if (hasStub) continue

    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: loc.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: STUB_PROVIDER_ID },
    })
    linked++
    logger.info(`Связан ${STUB_PROVIDER_ID} со складом ${loc.id} (${loc.name})`)
  }

  logger.info(
    linked
      ? `Готово: добавлено связей ${linked}.`
      : `Связи ${STUB_PROVIDER_ID} уже есть на всех складах.`
  )
}
