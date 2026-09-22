import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { reviewDb, reviewFailure } from "../../../../utils/review-http"
import { ReviewError } from "../../../../utils/review-validation"
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  try {
    const ids = typeof req.query.product_ids === "string" ? [...new Set(req.query.product_ids.split(","))] : []
    if (!ids.length || ids.length > 100 || ids.some(id => !/^prod_[a-zA-Z0-9]+$/.test(id))) throw new ReviewError(400, "INVALID_PRODUCT")
    const rows = await reviewDb(req)("tamir_review").select("product_id").count("* as count").avg("rating as rating").whereIn("product_id", ids).where("status", "published").groupBy("product_id")
    res.json({ summaries: Object.fromEntries(rows.map(r => [r.product_id, { count: Number(r.count), rating: Number(r.rating) }])) })
  } catch (error) { reviewFailure(error, res) }
}
