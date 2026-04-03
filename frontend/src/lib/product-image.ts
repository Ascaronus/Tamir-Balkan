import type { HttpTypes } from "@medusajs/types"

export function getStoreProductImageUrl(
  product: HttpTypes.StoreProduct
): string | undefined {
  const fromGallery = product.images?.[0]?.url
  if (fromGallery) return fromGallery
  const th = product.thumbnail
  if (typeof th === "string") return th
  if (th && typeof th === "object" && "url" in th) {
    return (th as { url: string }).url
  }
  return undefined
}
