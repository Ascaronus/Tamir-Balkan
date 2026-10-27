"use client"
import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/components/auth/AuthProvider"
import { LoginDialog } from "@/components/auth/LoginDialog"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import Link from "@/components/i18n/LocalizedLink"
import { ProductCard } from "@/components/store/ProductCard"
import { FavoriteButton } from "./FavoriteButton"
import { useWishlist } from "./WishlistProvider"
import { listProductsByCountry } from "@/lib/store/products"
import { englishReady } from "@/lib/i18n/paths"
import { canPurchase, variantAmount } from "@/lib/store/commerce"
import type { CatalogProduct } from "@/lib/store/catalog"
export function WishlistPage() {
  const { customer, isReady } = useAuth(), { ids, ready, error, retry } = useWishlist(), { t, locale } = useLocaleContext()
  const [login, setLogin] = useState(false), trigger = useRef<HTMLButtonElement>(null)
  const [page, setPage] = useState(0), [attempt, setAttempt] = useState(0)
  const currentPage = Math.min(page, Math.max(0, Math.ceil(ids.length / 24) - 1))
  const visibleIds = ids.slice(currentPage * 24, (currentPage + 1) * 24)
  const key = `${customer?.id ?? ""}:${locale}:${visibleIds.join(",")}`
  const [result, setResult] = useState<{ key: string; products: CatalogProduct[]; failed?: boolean } | null>(null)
  useEffect(() => {
    if (!customer || !ready || !visibleIds.length) return
    const abort = new AbortController()
    void listProductsByCountry({ countryCode: "rs", locale, ids: visibleIds, limit: 24, signal: abort.signal }).then(({ products }) => {
      if (abort.signal.aborted) return
      setResult({ key, products: products.filter(product => locale !== "en" || englishReady(product)).map(product => {
        const variant = product.variants?.find(canPurchase) ?? product.variants?.[0]
        return { ...product, catalog: { price: variantAmount(variant?.calculated_price) ?? null, currency_code: variant?.calculated_price?.currency_code ?? "rsd", preferred_variant_id: variant?.id ?? null, matching_variant_ids: [] } }
      }) })
    }).catch(() => { if (!abort.signal.aborted) setResult({ key, products: [], failed: true }) })
    return () => abort.abort()
    // key includes the account, locale and exact batch; unrelated heart updates
    // do not issue per-product fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, attempt])
  if (!isReady) return <p role="status">{t("wishlist.loading")}</p>
  if (!customer) return <div className="wishlist-empty"><p>{t("wishlist.signIn")}</p><button ref={trigger} type="button" className="button-primary" onClick={() => setLogin(true)}>{t("auth.login.title")}</button>{login && <LoginDialog trigger={trigger} onDismiss={() => setLogin(false)} />}</div>
  if (error && !ready) return <p role="alert">{t("common.loadFailed")} <button type="button" onClick={retry}>{t("common.retry")}</button></p>
  if (!ready) return <p role="status">{t("wishlist.loading")}</p>
  if (!ids.length) return <div className="wishlist-empty"><p>{t("wishlist.empty")}</p><Link href="/rs/catalog" className="button-primary">{t("wishlist.catalog")}</Link></div>
  if (result?.key !== key) return <p role="status">{t("wishlist.loading")}</p>
  if (result.failed) return <p role="alert">{t("common.loadFailed")} <button type="button" onClick={() => setAttempt(n => n + 1)}>{t("common.retry")}</button></p>
  return <>
    <ul className="product-grid">{visibleIds.map(id => {
      const product = result.products.find(p => p.id === id)
      return product ? <ProductCard key={id} product={product} showAvailability /> : <li key={id} className="wishlist-unavailable"><p>{t("wishlist.unavailable")}</p><FavoriteButton productId={id} /></li>
    })}</ul>
    {ids.length > 24 && <nav className="catalog-pagination" aria-label={t("wishlist.title")}>
      {Array.from({ length: Math.ceil(ids.length / 24) }, (_, index) => <button type="button" key={index} aria-current={currentPage === index ? "page" : undefined} onClick={() => setPage(index)}>{index + 1}</button>)}
    </nav>}
  </>
}
