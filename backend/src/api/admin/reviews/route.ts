import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { moderator, reviewDb, reviewFailure } from "../../../utils/review-http"
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  try {
    await moderator(req)
    const db = reviewDb(req)
    const offset = Math.min(100000, Math.max(0, Math.floor(Number(req.query.offset) || 0)))
    const reviews = await db("tamir_review as r").leftJoin("product as p", "p.id", "r.product_id").leftJoin("customer as c", "c.id", "r.customer_id")
      .select("r.id", "r.product_id", "r.customer_id", "c.email as author_email", "c.first_name as author_name", "p.title as product_title", "r.name", "r.body", "r.rating", "r.version", "r.status", "r.created_at", "r.updated_at")
      .select(db.raw("(SELECT COUNT(*) FROM tamir_review_vote v WHERE v.review_id = r.id AND v.value = 1) AS up"))
      .select(db.raw("(SELECT COUNT(*) FROM tamir_review_vote v WHERE v.review_id = r.id AND v.value = -1) AS down"))
      .orderBy("r.created_at", "desc").orderBy("r.id").limit(30).offset(offset)
    const count = await db("tamir_review").count("* as count").first()
    res.json({ reviews, count: Number(count?.count || 0) })
  } catch (error) { reviewFailure(error, res) }
}
