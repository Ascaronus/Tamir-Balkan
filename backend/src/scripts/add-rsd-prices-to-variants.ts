import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { upsertVariantPricesWorkflow } from "@medusajs/core-flows"

/** Добавляет цену в RSD ко всем вариантам (демо: ~10 EUR → 1200 RSD). */
export default async function addRsdPricesToVariants({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "variants.id"],
    pagination: { take: 500 },
  })

  const variantPrices: {
    variant_id: string
    product_id: string
    prices: { amount: number; currency_code: string }[]
  }[] = []

  const previousVariantIds: string[] = []

  for (const p of products as { id: string; variants?: { id: string }[] }[]) {
    for (const v of p.variants ?? []) {
      previousVariantIds.push(v.id)
      variantPrices.push({
        variant_id: v.id,
        product_id: p.id,
        prices: [{ amount: 1200, currency_code: "rsd" }],
      })
    }
  }

  if (!variantPrices.length) {
    logger.info("No variants found; skip RSD prices.")
    return
  }

  await upsertVariantPricesWorkflow(container).run({
    input: {
      variantPrices,
      previousVariantIds,
    },
  })

  logger.info(`Added RSD prices to ${variantPrices.length} variant(s).`)
}
