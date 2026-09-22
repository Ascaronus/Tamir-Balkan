import { createHmac } from "node:crypto"
import type { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ReviewError, isReviewModerator } from "./review-validation"

export const reviewDb = (req: MedusaRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
export function hashIdentity(value: string) {
  const secret = process.env.REVIEW_RATE_SECRET || process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw new ReviewError(503, "REVIEWS_UNAVAILABLE")
  return createHmac("sha256", secret).update(value).digest("hex")
}
export async function customerId(req: AuthenticatedMedusaRequest) {
  const id = req.auth_context?.actor_id
  if (!id) return null
  const customer = await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(id)
  return customer?.has_account ? id : null
}
export async function moderator(req: AuthenticatedMedusaRequest) {
  if (req.auth_context?.actor_type !== "user" || !req.auth_context.actor_id) throw new ReviewError(403, "FORBIDDEN")
  const user = await req.scope.resolve(Modules.USER).retrieveUser(req.auth_context.actor_id)
  if (!isReviewModerator(user)) throw new ReviewError(403, "FORBIDDEN")
  return user.id
}
export async function publishedProduct(req: MedusaRequest, id: unknown) {
  if (typeof id !== "string" || !/^prod_[a-zA-Z0-9]+$/.test(id)) throw new ReviewError(400, "INVALID_PRODUCT")
  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product", fields: ["id", "status"], filters: { id } })
  if (data[0]?.status !== "published") throw new ReviewError(404, "PRODUCT_NOT_FOUND")
  return id
}
export async function rateLimit(req: MedusaRequest, action: string, limit: number, identity?: string) {
  const db = reviewDb(req)
  const key = hashIdentity(`${action}:${identity || req.ip || req.socket.remoteAddress || "unknown"}`)
  const { rows } = await db.raw(`INSERT INTO tamir_review_rate (key, count, expires_at) VALUES (?, 1, now() + interval '1 hour')
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN tamir_review_rate.expires_at < now() THEN 1 ELSE tamir_review_rate.count + 1 END,
    expires_at = CASE WHEN tamir_review_rate.expires_at < now() THEN now() + interval '1 hour' ELSE tamir_review_rate.expires_at END RETURNING count`, [key])
  await db("tamir_review_rate").where("expires_at", "<", new Date()).delete()
  if (Number(rows[0].count) > limit) throw new ReviewError(429, "TOO_MANY_REQUESTS")
}
export function reviewFailure(error: unknown, res: MedusaResponse) {
  if (error instanceof ReviewError) return res.status(error.status).json({ code: error.code, message: error.code })
  if ((error as { code?: string })?.code === "23505") return res.status(409).json({ code: "ALREADY_SUBMITTED", message: "ALREADY_SUBMITTED" })
  // Never send SQL, identities, email addresses, or secret configuration to the browser.
  return res.status(503).json({ code: "REVIEWS_UNAVAILABLE", message: "REVIEWS_UNAVAILABLE" })
}
