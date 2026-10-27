import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { validFavoriteProduct } from "./wishlist"
export class WishlistError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}
export async function wishlistOwner(req: AuthenticatedMedusaRequest) {
  const id = req.auth_context?.actor_id
  if (!id || req.auth_context.actor_type !== "customer") throw new WishlistError(401, "LOGIN_REQUIRED")
  const customer = await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(id).catch(error => {
    if (error?.type === "not_found") return null
    throw error
  })
  if (!customer?.has_account || customer.deleted_at) throw new WishlistError(401, "LOGIN_REQUIRED")
  return id
}
export function favoriteProductId(value: unknown) {
  if (!validFavoriteProduct(value)) throw new WishlistError(400, "INVALID_PRODUCT")
  return value
}
export async function availableFavoriteProduct(req: AuthenticatedMedusaRequest, id: string) {
  const channels = req.publishable_key_context?.sales_channel_ids ?? []
  if (!channels.length) throw new WishlistError(404, "PRODUCT_NOT_FOUND")
  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product",
    fields: ["id", "status", "sales_channels.id"], filters: { id, status: "published" } }, { cache: { enable: false } })
  const product = data[0]
  if (!product || product.status !== "published" || !product.sales_channels?.some(channel => channel && channels.includes(channel.id))) {
    throw new WishlistError(404, "PRODUCT_NOT_FOUND")
  }
}
export function wishlistFailure(error: unknown, res: MedusaResponse) {
  if (error instanceof WishlistError) return res.status(error.status).json({ code: error.code })
  if ((error as { code?: string })?.code === "23503") return res.status(404).json({ code: "PRODUCT_NOT_FOUND" })
  return res.status(503).json({ code: "WISHLIST_UNAVAILABLE" })
}
