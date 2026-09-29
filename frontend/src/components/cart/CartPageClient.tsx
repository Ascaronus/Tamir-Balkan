"use client"
import Link from "next/link"
import { useAuth } from "@/components/auth/AuthProvider"
import { useCart } from "./CartProvider"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { formatMoney } from "@/lib/format-money"
import { ProductImage } from "@/components/store/ProductImage"
import { normalizeImageUrl } from "@/lib/product-image"
export function CartPageClient() {
  const { t, locale } = useLocaleContext()
  const { customer } = useAuth()
  const { cart, isReady, isMutating, error, refresh, updateItemQuantity, removeItem } = useCart()
  const money = (value: number) => formatMoney(value, cart?.currency_code ?? "rsd", locale === "sr" ? "sr-Latn-RS" : "en-GB")
  if (!isReady) return <p className="py-6">{t("cartPage.loading")}</p>
  const items = cart?.items ?? []
  return <div>
    {error && <div role="alert" className="mb-6 rounded bg-red-50 p-3 text-sm text-red-700">{t("cartPage.updateFailed")} <button type="button" className="underline" onClick={() => void refresh().catch(() => undefined)}>{t("common.retry")}</button></div>}
    {!items.length ? <div className="empty-state"><p>{t("cartPage.empty")}</p><Link className="button-secondary mt-6" href="/rs/catalog">{t("product.backToCatalog")}</Link></div> : <div className="commerce-layout">
      <div><ul className="divide-y divide-[var(--store-border)] border-y border-[var(--store-border)]" aria-busy={isMutating}>
        {items.map(item => <li key={item.id} data-line-id={item.id} className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-4 py-6 sm:grid-cols-[112px_minmax(0,1fr)]">
          <div className="relative aspect-[3/4] overflow-hidden bg-[var(--store-bg-muted)]"><ProductImage src={normalizeImageUrl(item.thumbnail)} alt={item.product_title ?? item.title} className="h-full w-full object-contain" /></div>
          <div className="min-w-0"><div className="flex flex-wrap justify-between gap-2"><Link className="text-base font-medium hover:underline" href={item.product_handle ? `/rs/products/${encodeURIComponent(item.product_handle)}?v_id=${encodeURIComponent(item.variant_id ?? "")}` : "/rs/catalog"}>{item.product_title ?? item.title}</Link><p className="text-base font-semibold tabular-nums">{money(item.total ?? item.unit_price * item.quantity)}</p></div>
            {item.variant_title && <p className="mt-2 text-sm text-[var(--store-text-muted)]">{item.variant_title}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-1"><button type="button" disabled={isMutating || item.quantity <= 1} onClick={() => void updateItemQuantity(item.id, item.quantity - 1).catch(() => undefined)} aria-label={t("cartPage.decreaseQty")} className="size-chip disabled:opacity-40">−</button><span className="w-10 text-center text-sm tabular-nums">{item.quantity}</span><button type="button" disabled={isMutating} onClick={() => void updateItemQuantity(item.id, item.quantity + 1).catch(() => undefined)} aria-label={t("cartPage.increaseQty")} className="size-chip disabled:opacity-40">+</button><button type="button" disabled={isMutating} onClick={() => void removeItem(item.id).catch(() => undefined)} className="button-quiet ml-auto disabled:opacity-40">{t("cartPage.remove")}</button></div>
          </div>
        </li>)}
      </ul><Link href="/rs/catalog" className="button-secondary mt-6">{t("product.backToCatalog")}</Link></div>
      <aside className="order-summary"><h2>{t("design.summary")}</h2><div className="my-6 flex flex-wrap justify-between gap-3 border-b border-[var(--store-border)] pb-6 text-sm"><span>{t("design.productsSubtotal")}</span><strong className="tabular-nums">{money(cart?.item_total ?? cart?.item_subtotal ?? cart?.subtotal ?? 0)}</strong></div><p className="mb-6 text-xs text-[var(--store-text-muted)]">{t("design.shippingLater")}</p><Link href="/rs/checkout" aria-disabled={isMutating} onClick={event => { if (isMutating) event.preventDefault() }} className={`button-primary w-full ${isMutating ? "opacity-50" : ""}`}>{t(customer ? "cartPage.checkout" : "checkout.continueGuest")}</Link><p className="mt-4 text-xs text-[var(--store-text-muted)]">{t("cartPage.guestCheckoutHint")}</p></aside>
    </div>}
  </div>
}
