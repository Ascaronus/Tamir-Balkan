"use client"
import { useState } from "react"
import { useVariantStock } from "@/lib/cart/useVariantStock"
import Link from "@/components/i18n/LocalizedLink"
import { useAuth } from "@/components/auth/AuthProvider"
import { useCart } from "./CartProvider"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { cartLineTotal, cartProductsTotal } from "@/lib/cart/display"
import { formatMoney } from "@/lib/format-money"
import { ProductImage } from "@/components/store/ProductImage"
import { normalizeImageUrl } from "@/lib/product-image"
export function CartPageClient() {
  const { t, locale } = useLocaleContext()
  const { customer } = useAuth()
  const { cart, isReady, isMutating, error, stockError, refresh, updateItemQuantity, removeItem } = useCart()
  const money = (value: number) => formatMoney(value, cart?.currency_code ?? "rsd", locale === "sr" ? "sr-Latn-RS" : "en-GB")
  const items = cart?.items ?? []
  const stock = useVariantStock(items.flatMap(item => item.variant_id ? [item.variant_id] : []), cart?.sales_channel_id,
    `${cart?.id ?? ""}:${items.map(item => `${item.id}:${item.quantity}`).join(",")}:${stockError?.variantId ?? ""}:${stockError?.available ?? ""}`)
  const availableFor = (variantId?: string | null) => {
    if (!variantId) return 0
    const fetched = stock[variantId]
    return fetched !== undefined ? fetched : stockError?.variantId === variantId ? stockError.available : undefined
  }
  const quantityFor = (variantId?: string | null) => items.filter(item => item.variant_id === variantId).reduce((sum, item) => sum + item.quantity, 0)
  const hasStockIssues = items.some(item => { const available = availableFor(item.variant_id); return typeof available === "number" && quantityFor(item.variant_id) > available })
  const [notice, setNotice] = useState<{ cartId: string; lineId: string; variantId: string; available: number } | null>(null)
  const noticeLimit = notice ? stock[notice.variantId] : undefined
  const localStockError = notice && notice.cartId === cart?.id && items.some(item => item.id === notice.lineId) && noticeLimit !== null
    ? { ...notice, available: typeof noticeLimit === "number" ? noticeLimit : notice.available } : null
  const stockNotice = localStockError ?? stockError
  const stockItem = stockNotice ? items.find(item => item.variant_id === stockNotice.variantId) : undefined
  const changeQuantity = (lineId: string, quantity: number, available: number | null | undefined) => {
    const item = items.find(item => item.id === lineId)
    const otherQuantity = items.filter(other => other.variant_id === item?.variant_id && other.id !== lineId).reduce((sum, other) => sum + other.quantity, 0)
    if (cart && item?.variant_id && typeof available === "number" && quantity > item.quantity && quantity + otherQuantity > available) {
      setNotice({ cartId: cart.id, lineId, variantId: item.variant_id, available })
      return
    }
    // Medusa validates the resulting total, even for decreases. Skip invalid
    // intermediate quantities (e.g. 3 -> 2 when only 1 is available).
    if (item && quantity < item.quantity && typeof available === "number") {
      const remaining = available - otherQuantity
      // Zero cannot be submitted as a quantity. Keep explicit removal available.
      if (remaining < 1) return
      quantity = Math.min(quantity, remaining)
    }
    setNotice(null)
    void updateItemQuantity(lineId, quantity).catch(() => undefined)
  }
  if (!isReady) return <p className="py-6">{t("cartPage.loading")}</p>
  return <div>
    {(error || localStockError) && <div role="alert" className="mb-6 rounded bg-red-50 p-3 text-sm text-red-700">{stockItem && <strong>{stockItem.product_title ?? stockItem.title}: </strong>}{stockNotice ? t("cartPage.stockLimit", { n: stockNotice.available }) : t("cartPage.updateFailed")} <button type="button" className="underline" onClick={() => { setNotice(null); void refresh().catch(() => undefined) }}>{t("common.retry")}</button></div>}
    {!items.length ? <div className="empty-state"><p>{t("cartPage.empty")}</p><Link className="button-secondary mt-6" href="/rs">{t("product.backToCatalog")}</Link></div> : <div className="commerce-layout">
      <div><ul className="cart-items" aria-busy={isMutating}>
        {items.map(item => {
          const available = availableFor(item.variant_id)
          const totalQuantity = quantityFor(item.variant_id)
          const otherQuantity = items.filter(other => other.variant_id === item.variant_id && other.id !== item.id).reduce((sum, other) => sum + other.quantity, 0)
          const fixedQuantity = typeof available === "number" && available - otherQuantity <= 1
          return <li key={item.id} data-line-id={item.id} className="cart-line">
          <div className="relative aspect-[3/4] overflow-hidden bg-[var(--store-bg-muted)]"><ProductImage src={normalizeImageUrl(item.thumbnail)} alt={item.product_title ?? item.title} className="h-full w-full object-contain" /></div>
          <div className="cart-line-details"><Link className="cart-line-title hover:underline" href={item.product_handle ? `/rs/products/${encodeURIComponent(item.product_handle)}?v_id=${encodeURIComponent(item.variant_id ?? "")}` : "/rs"}>{item.product_title ?? item.title}</Link>
            {item.variant_title && <p className="mt-2 text-sm text-[var(--store-text-muted)]">{item.variant_title}</p>}
            {typeof available === "number" && totalQuantity > available && <p role="alert" className="mt-2 text-sm text-red-700">{t("cartPage.stockChanged", { n: available, quantity: totalQuantity })}</p>}
            <p className="cart-line-price tabular-nums">{money(cartLineTotal(item))}</p>
            <div className="cart-line-actions"><div className="quantity-stepper"><button type="button" disabled={isMutating || item.quantity <= 1 || (typeof available === "number" && available - otherQuantity < 1)} onClick={() => changeQuantity(item.id, item.quantity - 1, available)} aria-label={t("cartPage.decreaseQty")} className="quantity-button">−</button><span className="quantity-value inline-flex items-center justify-center tabular-nums">{item.quantity}</span><button type="button" disabled={isMutating || fixedQuantity} onClick={() => changeQuantity(item.id, item.quantity + 1, available)} aria-label={t("cartPage.increaseQty")} className="quantity-button">+</button></div><button type="button" disabled={isMutating} onClick={() => void removeItem(item.id).catch(() => undefined)} className="button-quiet cart-remove disabled:opacity-40"><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg><span>{t("cartPage.remove")}</span></button></div>
          </div>
        </li>})}
      </ul><Link href="/rs" className="cart-continue mt-6">← {t("product.backToCatalog")}</Link></div>
      <aside className="order-summary"><h2>{t("design.summary")}</h2><div className="my-6 flex flex-wrap justify-between gap-3 text-sm"><span>{t("design.productsSubtotal")}</span><strong className="tabular-nums">{money(cartProductsTotal(cart))}</strong></div><p className="mb-6 text-xs text-[var(--store-text-muted)]">{t("design.shippingLater")}</p><Link href="/rs/checkout" aria-disabled={isMutating || hasStockIssues} onClick={event => { if (isMutating || hasStockIssues) event.preventDefault() }} className={`button-primary w-full ${isMutating || hasStockIssues ? "opacity-50" : ""}`}>{t(customer ? "cartPage.checkout" : "checkout.continueGuest")}</Link><p className="mt-6 text-xs text-[var(--store-text-muted)]">{t("cartPage.guestCheckoutHint")}</p></aside>
    </div>}
  </div>
}
