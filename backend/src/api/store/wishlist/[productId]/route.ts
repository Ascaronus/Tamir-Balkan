import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { removeFavorite } from "../../../../utils/wishlist"
import { wishlistOwner, favoriteProductId, wishlistFailure } from "../../../../utils/wishlist-http"
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  try {
    const owner = await wishlistOwner(req), id = favoriteProductId(req.params.productId)
    await removeFavorite(req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION), owner, id)
    return res.json({ product_id: id, saved: false })
  } catch (error) { return wishlistFailure(error, res) }
}
