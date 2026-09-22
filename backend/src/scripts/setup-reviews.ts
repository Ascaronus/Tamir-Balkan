import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { reviewSchema } from "../utils/review-schema"

export default async function setupReviews({ container }: ExecArgs) {
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await db.transaction(async trx => {
    await trx.raw("SELECT pg_advisory_xact_lock(67195051, 1)")
    await trx.raw(reviewSchema)
  })
  container.resolve("logger").info("Review schema ready")
}
