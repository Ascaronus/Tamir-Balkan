import { randomUUID } from "node:crypto"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { moderator, reviewDb, reviewFailure } from "../../../../utils/review-http"
import { reviewText, ReviewError } from "../../../../utils/review-validation"
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const admin = await moderator(req)
    const input = (req.body || {}) as Record<string, unknown>
    const changes: Record<string, unknown> = {}
    if (input.body !== undefined) changes.body = reviewText(input.body, 250)
    if (input.name !== undefined) {
      changes.name = reviewText(input.name, 60)
      if (String(changes.name).includes("@")) throw new ReviewError(400, "INVALID_NAME")
    }
    if (input.status !== undefined) {
      if (!["published", "hidden", "deleted"].includes(String(input.status))) throw new ReviewError(400, "INVALID_STATUS")
      changes.status = input.status
    }
    if (!Object.keys(changes).length) throw new ReviewError(400, "INVALID_REVIEW")
    // Do not let moderators change the customer's star rating or vote totals.
    await reviewDb(req).transaction(async trx => {
      const prior = await trx("tamir_review").where("id", req.params.id).forUpdate().first()
      if (!prior) throw new ReviewError(404, "REVIEW_NOT_FOUND")
      if (!Number.isInteger(input.version) || input.version !== prior.version) throw new ReviewError(409, "REVIEW_CHANGED")
      await trx("tamir_review").where("id", prior.id).update({ ...changes, version: prior.version + 1, updated_at: new Date() })
      await trx("tamir_review_audit").insert({ id: randomUUID(), review_id: prior.id, moderator_id: admin,
        previous: JSON.stringify({ name: prior.name, body: prior.body, status: prior.status }), changes: JSON.stringify(changes) })
    })
    res.json({ success: true })
  } catch (error) { reviewFailure(error, res) }
}
