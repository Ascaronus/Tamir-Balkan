import type { HttpTypes } from "@medusajs/types"

function colorKeywordFromVariant(
  variant: HttpTypes.StoreProductVariant
): string | null {
  for (const o of variant.options ?? []) {
    const title = o.option?.title?.toLowerCase() ?? ""
    if (
      title !== "color" &&
      title !== "colour" &&
      title !== "цвет" &&
      title !== "цветовая группа"
    )
      continue
    const v = o.value?.toLowerCase() ?? ""
    if (v.includes("white") || v.includes("бел")) return "white"
    if (v.includes("black") || v.includes("черн") || v.includes("чёрн"))
      return "black"
  }
  const t = (variant.title ?? "").toLowerCase()
  if (t.includes("white") || t.includes("бел")) return "white"
  if (t.includes("black") || t.includes("черн") || t.includes("чёрн"))
    return "black"
  return null
}

/** Картинки для варианта: сначала явная привязка в Medusa; иначе эвристика по Color + URL (сид без variant.images). */
export function getImagesForVariant(
  product: HttpTypes.StoreProduct,
  variantId?: string | null
): HttpTypes.StoreProductImage[] {
  const all = product.images ?? []
  if (!variantId || !product.variants?.length) return all

  const variant = product.variants.find((v) => v.id === variantId)
  if (!variant) return all

  // Сначала эвристика по URL: в админке часто к вариантам вешают одно и то же превью —
  // тогда variant.images есть, но белый вариант всё равно показывает чёрное фото.
  const kw = colorKeywordFromVariant(variant)
  if (kw) {
    const byUrl = all.filter((img) => img.url?.toLowerCase().includes(kw))
    if (byUrl.length) return byUrl
  }

  if (variant.images?.length) {
    const ids = new Set(variant.images.map((i) => i.id))
    const linked = all.filter((i) => ids.has(i.id))
    if (linked.length) return linked
  }

  return all
}

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
