"use client"
import { useEffect, useId, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import Link from "@/components/i18n/LocalizedLink"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { ProductImage } from "@/components/store/ProductImage"
import { normalizeImageUrl } from "@/lib/product-image"
import { formatMoney } from "@/lib/format-money"
import { cartLineHref, cartLineTotal, cartProductsTotal } from "@/lib/cart/display"
import { CartPreviewInteraction, cartPreviewPosition } from "@/lib/cart/preview-interaction"
import { useCart } from "./CartProvider"
import { CartLink } from "./CartLink"

export function CartPreview() {
  const path = usePathname(), { locale } = useLocaleContext()
  return <CartPreviewControl key={`${path}:${locale}`} />
}
export function CartPreviewControl() {
  const { t } = useLocaleContext()
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLAnchorElement>(null)
  const [open, setOpen] = useState(false)
  const [interaction] = useState(() => new CartPreviewInteraction(setOpen))
  const [position, setPosition] = useState<ReturnType<typeof cartPreviewPosition> | null>(null)
  const id = useId()
  useEffect(() => () => interaction.dispose(), [interaction])
  useEffect(() => {
    if (!open) return
    const positionPanel = () => {
      const bounds = trigger.current?.getBoundingClientRect()
      if (bounds) setPosition(cartPreviewPosition(bounds, { width: window.innerWidth, height: window.innerHeight }))
    }
    positionPanel()
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      const focusInside = root.current?.contains(document.activeElement)
      interaction.dismiss()
      if (focusInside) trigger.current?.focus({ preventScroll: true })
    }
    window.addEventListener("resize", positionPanel)
    window.addEventListener("scroll", positionPanel, true)
    document.addEventListener("keydown", dismiss)
    return () => {
      window.removeEventListener("resize", positionPanel)
      window.removeEventListener("scroll", positionPanel, true)
      document.removeEventListener("keydown", dismiss)
    }
  }, [open, interaction])
  return <div ref={root} className="header-cart-preview"
    onPointerEnter={event => { if (event.pointerType === "mouse" && window.matchMedia("(any-hover: hover)").matches) interaction.enterPointer() }}
    onPointerLeave={event => { if (event.pointerType === "mouse") interaction.leavePointer() }}
    onPointerDown={event => { if (event.pointerType === "touch") interaction.dismiss() }}
    onFocus={event => interaction.focusWithin(event.target.matches(":focus-visible"))}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) interaction.blurOutside() }}>
    <Link ref={trigger} href="/rs/cart" className="header-action" aria-label={t("header.cartAria")}
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => interaction.dismiss()}>
      <CartLink href="/rs/cart" /><span className="header-action-label">{t("header.cart")}</span>
    </Link>
    {open && <section id={id} tabIndex={-1} aria-label={t("cartPreview.title")} className="cart-preview"
      style={{ ...(position ?? {}), visibility: position ? "visible" : "hidden" }}>
      <h2>{t("cartPreview.title")}</h2>
      <CartPreviewContents onNavigate={() => interaction.dismiss()} />
    </section>}
  </div>
}
export function CartPreviewContents({ onNavigate }: { onNavigate: () => void }) {
  const { t, locale } = useLocaleContext()
  const { cart, isReady, isMutating, error, displayReady, displayError, retryDisplay, removeItem } = useCart()
  const [removingId, setRemovingId] = useState<string | null>(null)
  const removalPending = useRef(false)
  const remove = async (id: string) => {
    if (removalPending.current || isMutating) return
    removalPending.current = true
    setRemovingId(id)
    try { await removeItem(id) } catch { /* CartProvider exposes the failure; keep the item available for retry. */ }
    finally { removalPending.current = false; setRemovingId(null) }
  }
  const money = (amount: number) => formatMoney(amount, cart?.currency_code ?? "rsd", locale === "sr" ? "sr-Latn-RS" : "en-GB")
  const failure = <div role="alert"><p>{t(cart && !displayError ? "cartPreview.updateError" : "cartPreview.error")}</p><button type="button" disabled={isMutating || removingId !== null} className="cart-preview-retry" onClick={() => void retryDisplay().catch(() => undefined)}>{t("common.retry")}</button></div>
  if (!isReady) return <p role="status">{t("cartPreview.loading")}</p>
  if ((error && !cart) || displayError) return failure
  if (!displayReady) return <p role="status">{t("cartPreview.loading")}</p>
  const items = cart?.items ?? []
  if (!items.length) return error ? failure : <p role="status">{t("cartPreview.empty")}</p>
  return <>
    {error && failure}
    <ul className="cart-preview-items">{items.map(item => {
      const href = cartLineHref(item, locale), title = item.product_title ?? item.title
      const details = <><div className="cart-preview-image"><ProductImage src={normalizeImageUrl(item.thumbnail)} alt="" className="h-full w-full object-cover" /></div>
        <div className="cart-preview-details"><span className="cart-preview-name">{title}</span>
          {item.variant_title && <span className="cart-preview-options">{item.variant_title}</span>}
          <span className="cart-preview-unit">{item.quantity} × {money(item.unit_price)}</span>
          <strong>{money(cartLineTotal(item))}</strong>
        </div></>
      const removeLabel = t("cartPreview.remove", { title })
      return <li key={item.id} className="cart-preview-row" aria-busy={removingId === item.id}>
        {href ? <Link className="cart-preview-item" href={href} onClick={onNavigate}>{details}</Link> : <div className="cart-preview-item">{details}</div>}
        <button type="button" className="cart-preview-remove" aria-label={removeLabel} title={removeLabel}
          disabled={isMutating || removingId !== null} onClick={event => {
            // Keep keyboard focus in the popover when this row (including the last one) disappears.
            if (document.activeElement === event.currentTarget && event.currentTarget.matches(":focus-visible")) event.currentTarget.closest<HTMLElement>(".cart-preview")?.focus({ preventScroll: true })
            void remove(item.id)
          }}>
          <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
        </button>
      </li>
    })}</ul>
    <div className="cart-preview-footer"><div className="cart-preview-total"><span>{t("cartPreview.total")}</span><strong>{money(cartProductsTotal(cart))}</strong></div>
      <Link href="/rs/cart" className="button-primary" onClick={onNavigate}>{t("cartPreview.viewCart")}</Link>
    </div>
  </>
}
