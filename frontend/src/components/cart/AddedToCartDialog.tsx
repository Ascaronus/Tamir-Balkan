"use client"

import { useEffect, useId, useRef } from "react"
import Link from "@/components/i18n/LocalizedLink"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { ProductImage } from "@/components/store/ProductImage"
import { normalizeImageUrl } from "@/lib/product-image"
import { formatMoney } from "@/lib/format-money"
import type { Cart } from "@/lib/cart/cart-client"

export type AddedProductDisplay = { title: string; thumbnail?: string; options: { label: string; value: string }[] }
export type CartAddition = { cartId: string; lineId: string; quantity: number; trigger: HTMLElement | null; display?: AddedProductDisplay }

export function AddedToCartDialog({ cart, addition, onDismiss }: { cart: Cart; addition: CartAddition; onDismiss: () => void }) {
  const { locale, t } = useLocaleContext()
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const item = cart.items?.find(item => item.id === addition.lineId)
  const hasItem = Boolean(item)
  useEffect(() => {
    const node = dialog.current
    if (!node || !hasItem) return
    const previousOverflow = document.body.style.overflow
    node.showModal()
    heading.current?.focus({ preventScroll: true })
    document.body.style.overflow = "hidden"
    return () => {
      node.close()
      document.body.style.overflow = previousOverflow
      const trigger = addition.trigger
      if (trigger?.isConnected) {
        if (!trigger.matches(":disabled")) trigger.focus({ preventScroll: true })
        else {
          // Adding the last available unit disables the trigger; return to its product heading.
          const fallback = trigger.closest(".product-summary")?.querySelector<HTMLElement>("h1")
          if (fallback) {
            const tabindex = fallback.getAttribute("tabindex")
            fallback.setAttribute("tabindex", "-1")
            fallback.focus({ preventScroll: true })
            if (tabindex === null) fallback.removeAttribute("tabindex")
            else fallback.setAttribute("tabindex", tabindex)
          }
        }
      }
    }
  }, [addition, hasItem]) // Preserve the modal while localized cart data refreshes.
  if (!item) return null
  const money = (amount: number) => formatMoney(amount, cart.currency_code, locale === "sr" ? "sr-Latn-RS" : "en-GB")
  const count = cart.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0
  const plural = new Intl.PluralRules(locale).select(count)
  const countLabel = t(plural === "one" ? "cartAdded.countOne" : plural === "few" ? "cartAdded.countFew" : "cartAdded.countOther", { n: count })
  const title = addition.display?.title ?? item.product_title ?? item.title
  const options = addition.display?.options
  // Allocate the server-calculated discounted line total to the newly added quantity.
  const addedAmount = item.quantity > 0 ? (item.total ?? item.unit_price * item.quantity) / item.quantity * addition.quantity : item.unit_price * addition.quantity
  return <dialog ref={dialog} className="cart-added-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onDismiss() }}>
    <div className="cart-added-content">
      <div className="cart-added-heading">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/cart/success.svg" width={24} height={24} alt="" />
        <h2 id={titleId} tabIndex={-1} ref={heading}>{t("cartAdded.title")}</h2>
        <button type="button" className="cart-added-close" aria-label={t("common.close")} onClick={onDismiss}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/cart/close.svg" width={20} height={20} alt="" />
        </button>
      </div>
      <div className="cart-added-product">
        <div className="cart-added-image"><ProductImage src={normalizeImageUrl(addition.display?.thumbnail ?? item.thumbnail)} alt={title} eager className="h-full w-full object-cover" /></div>
        <div className="cart-added-details">
          <p className="cart-added-name">{title}</p>
          {options ? options.filter(option => option.value.trim()).map((option, index) => <p key={index}>{option.label}: {option.value}</p>) : item.variant_title && <p>{item.variant_title}</p>}
          <p>{t("cartAdded.addedQuantity", { n: addition.quantity })}</p>
          <p className="cart-added-price">{money(addedAmount)}</p>
        </div>
      </div>
      <div className="cart-added-summary">
        <p>{countLabel}</p>
        <div className="cart-added-subtotal"><span>{t("cartAdded.subtotal")}</span><span>{money(cart.item_total ?? cart.item_subtotal ?? cart.subtotal ?? 0)}</span></div>
        <p>{t("cartAdded.shipping")}</p>
      </div>
      <div className="cart-added-actions">
        <button type="button" className="button-secondary" onClick={onDismiss}>{t("cartAdded.continue")}</button>
        <Link href="/rs/cart" className="button-primary" onClick={onDismiss}>{t("cartAdded.goToCart")}</Link>
      </div>
    </div>
  </dialog>
}
