"use client"
import { useAuth } from "@/components/auth/AuthProvider"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import Link from "@/components/i18n/LocalizedLink"
import { HeartIcon } from "./FavoriteButton"
import { useWishlist } from "./WishlistProvider"
export function WishlistLink() {
  const { customer } = useAuth(), { ids } = useWishlist(), t = useTranslations()
  if (!customer) return null
  return <Link href="/rs/wishlist" className="header-action header-wishlist" aria-label={`${t("wishlist.title")}${ids.length ? ` (${ids.length})` : ""}`}>
    <HeartIcon filled /><span className="header-action-label">{t("wishlist.title")}</span>{ids.length > 0 && <span className="wishlist-count">{ids.length}</span>}
  </Link>
}
