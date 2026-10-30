"use client"
import { useWishlist } from "./WishlistProvider"
import { useTranslations } from "@/components/i18n/LocaleProvider"
export function HeartIcon({ filled = false }: { filled?: boolean }) {
  return <span aria-hidden="true" className={`favorite-heart${filled ? " favorite-heart-filled" : ""}`} />
}
export function FavoriteButton({ productId, overlay = false }: { productId: string; overlay?: boolean }) {
  const { ids, pending, ready, toggle } = useWishlist()
  const t = useTranslations(), active = ids.includes(productId), busy = pending.includes(productId)
  return <button type="button" className={`favorite-button${overlay ? " favorite-overlay" : ""}`}
    aria-label={t(active ? "wishlist.remove" : "wishlist.add")} aria-pressed={active} aria-busy={busy}
    disabled={!ready || busy} onClick={event => { event.preventDefault(); event.stopPropagation(); toggle(productId, event.currentTarget) }}>
    <HeartIcon filled={active} />
  </button>
}
