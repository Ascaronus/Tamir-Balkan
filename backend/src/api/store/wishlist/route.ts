import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { favoriteIds, saveFavorite } from "../../../utils/wishlist"
import { wishlistOwner, favoriteProductId, availableFavoriteProduct, wishlistFailure, WishlistError } from "../../../utils/wishlist-http"
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  try {
    const owner = await wishlistOwner(req)
    return res.json({ product_ids: await favoriteIds(req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION), owner) })
  } catch (error) { return wishlistFailure(error, res) }
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  try {
    const owner = await wishlistOwner(req)
    const body = req.body as Record<string, unknown> | undefined
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "product_id")) throw new WishlistError(400, "INVALID_BODY")
    const id = favoriteProductId(body.product_id)
    await availableFavoriteProduct(req, id)
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    await saveFavorite(db, owner, id)
    return res.status(200).json({ product_id: id, saved: true })
  } catch (error) { return wishlistFailure(error, res) }
}
