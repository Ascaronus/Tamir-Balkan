"use client"
import { useWishlist } from "./WishlistProvider"
import { useTranslations } from "@/components/i18n/LocaleProvider"
export function HeartIcon({ filled = false }: { filled?: boolean }) {
  return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M12 21C10 19 2 13 2 7C2 1 9 0 12 5C15 0 22 1 22 7C22 13 14 19 12 21Z" /></svg>
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
