import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { productUrlSchema } from "../utils/product-urls"
import { reviewSchema } from "../utils/review-schema"

import { registrationSchema } from "../utils/registration-code"

import { passwordResetSchema } from "../utils/password-reset"

export default async function setupReviews({ container }: ExecArgs) {
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await db.transaction(async trx => {
    await trx.raw("SELECT pg_advisory_xact_lock(67195051, 1)")
    await trx.raw(reviewSchema)
    await trx.raw(productUrlSchema)
    await trx.raw(registrationSchema)
    await trx.raw(passwordResetSchema)
  })
  container.resolve("logger").info("Review schema ready")
}
