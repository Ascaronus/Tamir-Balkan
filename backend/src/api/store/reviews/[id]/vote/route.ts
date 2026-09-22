import { randomUUID } from "node:crypto"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { reviewDb, customerId, rateLimit, reviewFailure } from "../../../../../utils/review-http"
import { voteInput, ReviewError } from "../../../../../utils/review-validation"
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const value = voteInput((req.body as Record<string, unknown>)?.value)
    const customer = await customerId(req)
    if (!customer) throw new ReviewError(401, "LOGIN_REQUIRED")
    await rateLimit(req, "vote", 60, customer)
    const db = reviewDb(req)
    const result = await db.transaction(async trx => {
      const review = await trx("tamir_review").where({ id: req.params.id, status: "published" }).forUpdate().first()
      if (!review) throw new ReviewError(404, "REVIEW_NOT_FOUND")
      const prior = await trx("tamir_review_vote").where({ review_id: review.id, customer_id: customer }).first()
      if (!prior) {
        await trx("tamir_review_vote").insert({ id: "vote_" + randomUUID(), review_id: review.id, customer_id: customer, value })
      }
      const score = await trx("tamir_review_vote").where("review_id", review.id).sum("value as score").first()
      const counts = await trx("tamir_review_vote").where("review_id", review.id).select(trx.raw("COUNT(*) FILTER (WHERE value = 1) AS up, COUNT(*) FILTER (WHERE value = -1) AS down")).first()
      return { score: Number(score?.score || 0), up: Number(counts.up), down: Number(counts.down), voted: true, duplicate: Boolean(prior) }
    })
    res.json(result)
  } catch (error) { reviewFailure(error, res) }
}
