"use client"

import Link from "next/link"
import { useCart } from "./CartProvider"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { formatMoney } from "@/lib/format-money"
import { ProductImage } from "@/components/store/ProductImage"
import { normalizeImageUrl } from "@/lib/product-image"

export function CartPageClient() {
  const { t, locale } = useLocaleContext()
  const { cart, isReady, isMutating, error, refresh, updateItemQuantity, removeItem } = useCart()
  const money = (value: number) => formatMoney(value, cart?.currency_code ?? "rsd", locale === "sr" ? "sr-Latn-RS" : "en-GB")
  if (!isReady) return <p className="p-6">{t("cartPage.loading")}</p>
  const items = cart?.items ?? []
  return <div className="overflow-hidden rounded-2xl border border-[var(--store-border)] bg-white">
    {error && <div role="alert" className="m-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{t("cartPage.updateFailed")} <button type="button" className="underline" onClick={() => void refresh().catch(() => undefined)}>{t("common.retry")}</button></div>}
    {!items.length ? <div className="p-6"><p>{t("cartPage.empty")}</p><Link className="mt-4 inline-block underline" href="/rs/catalog">{t("product.backToCatalog")}</Link></div> : <>
      <ul className="divide-y divide-[var(--store-border)]" aria-busy={isMutating}>
        {items.map(item => <li key={item.id} data-line-id={item.id} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-4 p-4 sm:grid-cols-[80px_minmax(0,1fr)_auto] sm:p-6">
          <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-[var(--store-bg-muted)]"><ProductImage src={normalizeImageUrl(item.thumbnail)} alt={item.product_title ?? item.title} className="h-full w-full object-contain" /></div>
          <div className="min-w-0">
            <Link className="text-sm font-semibold hover:underline" href={item.product_handle ? `/rs/products/${encodeURIComponent(item.product_handle)}?v_id=${encodeURIComponent(item.variant_id ?? "")}` : "/rs/catalog"}>{item.product_title ?? item.title}</Link>
            {item.variant_title && <p className="mt-1 text-sm text-[var(--store-text-muted)]">{item.variant_title}</p>}
            <p className="mt-1 text-sm tabular-nums">{money(item.total ?? item.unit_price * item.quantity)}</p>
          </div>
          <div className="col-start-2 flex items-center gap-2 sm:col-start-auto">
            <button type="button" disabled={isMutating || item.quantity <= 1} onClick={() => void updateItemQuantity(item.id, item.quantity - 1).catch(() => undefined)} aria-label={t("cartPage.decreaseQty")} className="h-9 w-9 shrink-0 rounded-full border disabled:opacity-40">−</button>
            <span className="w-10 shrink-0 text-center text-sm tabular-nums">{item.quantity}</span>
            <button type="button" disabled={isMutating} onClick={() => void updateItemQuantity(item.id, item.quantity + 1).catch(() => undefined)} aria-label={t("cartPage.increaseQty")} className="h-9 w-9 shrink-0 rounded-full border disabled:opacity-40">+</button>
            <button type="button" disabled={isMutating} onClick={() => void removeItem(item.id).catch(() => undefined)} className="ml-2 h-9 rounded-full border px-3 text-sm disabled:opacity-40">{t("cartPage.remove")}</button>
          </div>
        </li>)}
      </ul>
      <div className="flex justify-between border-t p-6 text-sm"><span>{t("cartPage.subtotal")}</span><strong className="tabular-nums">{money(cart?.item_subtotal ?? cart?.subtotal ?? 0)}</strong></div>
      <div className="border-t p-6"><Link href="/rs/checkout" aria-disabled={isMutating} onClick={event => { if (isMutating) event.preventDefault() }} className="flex h-11 items-center justify-center rounded-full bg-[var(--store-text)] text-sm font-semibold text-white">{t("cartPage.checkout")}</Link><p className="mt-2 text-xs text-[var(--store-text-muted)]">{t("cartPage.guestCheckoutHint")}</p></div>
    </>}
  </div>
}
