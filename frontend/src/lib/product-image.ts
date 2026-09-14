import type { HttpTypes } from "@medusajs/types"

export function normalizeImageUrl(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined
  const base = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  try {
    const url = new URL(value.trim(), base)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    if (["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(url.hostname)) {
      const publicBase = new URL(base)
      url.protocol = publicBase.protocol
      url.host = publicBase.host
    }
    return url.href
  } catch { return undefined }
}

/** Explicit variant photos first; every product photo remains accessible. */
export function getImagesForVariant(product: HttpTypes.StoreProduct, variantId?: string | null): { id: string; url: string }[] {
  const variant = product.variants?.find((v) => v.id === variantId)
  const sources = [...(variant?.images ?? []), ...(product.images ?? []), ...(product.thumbnail ? [{ id: "thumbnail", url: product.thumbnail }] : [])]
  const seen = new Set<string>()
  return sources.flatMap((image) => {
    const url = normalizeImageUrl(image.url)
    if (!url || seen.has(url)) return []
    seen.add(url)
    return [{ id: image.id || url, url }]
  })
}

export function getStoreProductImageUrl(product: HttpTypes.StoreProduct): string | undefined {
  return normalizeImageUrl(product.thumbnail) ?? getImagesForVariant(product)[0]?.url
}
