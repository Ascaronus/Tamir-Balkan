import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { decimalAttributesSchema } from "../utils/decimal-attributes-schema"

export default async function setupDecimalAttributes({ container }: ExecArgs) {
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await db.transaction(async trx => {
    await trx.raw("SET LOCAL lock_timeout = '10s'")
    await trx.raw("SELECT pg_advisory_xact_lock(67195051, 2)")
    await trx.raw(decimalAttributesSchema)
  })
  container.resolve("logger").info("Decimal product/variant/inventory measurements ready")
}
