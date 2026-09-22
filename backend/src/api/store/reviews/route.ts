import { Modules } from "@medusajs/framework/utils"
import { randomUUID } from "node:crypto"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { reviewDb, customerId, publishedProduct, rateLimit, reviewFailure } from "../../../utils/review-http"
import { reviewInput, publicReview, ReviewError } from "../../../utils/review-validation"
import { verifyCaptcha } from "../../../utils/captcha"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  try {
    const productId = await publishedProduct(req, req.query.product_id)
    const customer = await customerId(req)
    const db = reviewDb(req)
    const offset = Math.min(100000, Math.max(0, Math.floor(Number(req.query.offset) || 0)))
    const [reviews, totals, own] = await Promise.all([
      db("tamir_review as r").select("r.id", "r.name", "r.body", "r.rating", "r.created_at")
        .select(db.raw("COALESCE((SELECT SUM(v.value) FROM tamir_review_vote v WHERE v.review_id = r.id),0) AS score"))
        .select(db.raw("(SELECT COUNT(*) FROM tamir_review_vote v WHERE v.review_id = r.id AND v.value = 1) AS up"))
        .select(db.raw("(SELECT COUNT(*) FROM tamir_review_vote v WHERE v.review_id = r.id AND v.value = -1) AS down"))
        .where({ "r.product_id": productId, "r.status": "published" }).orderBy("r.created_at", "desc").orderBy("r.id").limit(20).offset(offset),
      db("tamir_review").where({ product_id: productId, status: "published" }).count("* as count").avg("rating as rating").first(),
      customer ? db("tamir_review").where({ product_id: productId, customer_id: customer }).first("id") : null,
    ])
    const votes = customer ? await db("tamir_review_vote").select("review_id").whereIn("review_id", reviews.map(r => r.id))
      .where("customer_id", customer) : []
    const voted = new Set(votes.map(v => v.review_id))
    res.json({ reviews: reviews.map(r => publicReview(r, voted.has(r.id))), count: Number(totals?.count || 0), rating: Number(totals?.rating || 0), has_review: Boolean(own) })
  } catch (error) { reviewFailure(error, res) }
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const customer = await customerId(req)
    if (!customer) throw new ReviewError(401, "LOGIN_REQUIRED")
    const input = (req.body || {}) as Record<string, unknown>
    const profile = await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(customer)
    const data = reviewInput({ ...input, name: profile.first_name })
    const productId = await publishedProduct(req, input.product_id)
    await rateLimit(req, "review", 10, customer)
    await verifyCaptcha(input.captcha_token, "review")
    const [review] = await reviewDb(req)("tamir_review").insert({ id: "rev_" + randomUUID(), product_id: productId, customer_id: customer, ...data }).returning("*")
    res.status(201).json({ review: publicReview(review) })
  } catch (error) { reviewFailure(error, res) }
}
