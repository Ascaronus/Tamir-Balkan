"use client"

import { productBrand } from "@/lib/seo/product"
import { colorSwatch, isColorOption } from "@/lib/store/catalog"
import { useAuth } from "@/components/auth/AuthProvider"
import { getAuthToken } from "@/lib/auth/auth-storage"
import { listProductsByCountry } from "@/lib/store/products"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import type { HttpTypes } from "@medusajs/types"
import { useCart } from "@/components/cart/CartProvider"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { ProductImage } from "@/components/store/ProductImage"
import { ColorSwatch } from "@/components/store/ColorSwatch"
import { getImagesForVariant } from "@/lib/product-image"
import { formatMoney } from "@/lib/format-money"
import { canPurchase, stockLimit, matchingVariant, variantAmount } from "@/lib/store/commerce"
import { localizedText, optionLabel } from "@/lib/i18n/content"

export function ProductDetails(props: { product: HttpTypes.StoreProduct; initialVariantId?: string; ratingSummary?: React.ReactNode }) {
  const searchParams = useSearchParams()
  const { customer, isReady: authReady } = useAuth()
  const { locale, t } = useLocaleContext()
  const [priced, setPriced] = useState<{ context: string; product: HttpTypes.StoreProduct } | null>(null)
  const pricingContext = `${customer?.id ?? "guest"}:${props.product.id}:${locale}`
  const [priceError, setPriceError] = useState(false)
  const [retryPrice, setRetryPrice] = useState(0)
  useEffect(() => {
    if (!authReady || !customer) return
    const abort = new AbortController()
    Promise.resolve().then(async () => {
      if (abort.signal.aborted) return
      setPriceError(false)
      const { products } = await listProductsByCountry({ countryCode: "rs", handle: props.product.handle, limit: 1, locale, token: getAuthToken(), signal: abort.signal })
      if (!abort.signal.aborted) {
        if (!products[0]) throw new Error("PRODUCT_UNAVAILABLE")
        setPriced({ context: pricingContext, product: products[0] })
      }
    }).catch(() => { if (!abort.signal.aborted) setPriceError(true) })
    return () => abort.abort()
  }, [authReady, customer, props.product.handle, locale, pricingContext, retryPrice])
  const product = customer && priced?.context === pricingContext ? priced.product : props.product
  const pricingReady = authReady && (!customer || priced?.context === pricingContext)
  const selectedId = searchParams.get("v_id") ?? props.initialVariantId
  return <><ProductSelection key={product.id + ":" + locale + ":" + (selectedId ?? "default")} product={product} initialVariantId={selectedId} ratingSummary={props.ratingSummary} pricingReady={pricingReady} />{priceError && customer && <p role="alert" className="mt-4 text-sm text-red-700">{t("common.loadFailed")} <button type="button" className="underline" onClick={() => setRetryPrice(n => n + 1)}>{t("common.retry")}</button></p>}</>
}

function ProductSelection({ product, initialVariantId, ratingSummary, pricingReady }: { product: HttpTypes.StoreProduct; initialVariantId?: string; ratingSummary?: React.ReactNode; pricingReady: boolean }) {
  const { t, locale } = useLocaleContext()
  const { cart, addItem, isReady, isMutating } = useCart()
  const variants = product.variants ?? []
  const [variantId, setVariantId] = useState(initialVariantId ?? variants.find(canPurchase)?.id ?? variants[0]?.id)
  const initialVariant = variants.find(v => v.id === variantId) ?? variants[0]
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() =>
    Object.fromEntries((initialVariant?.options ?? []).map(o => [o.option_id, o.value])))
  const variant = product.options?.length
    ? variants.find(v => (product.options ?? []).every(option =>
        v.options?.some(o => o.option_id === option.id && o.value === selectedOptions[option.id])))
    : initialVariant
  const images = getImagesForVariant(product, variant?.id)
  const [imageIndex, setImageIndex] = useState(0)
  const activeIndex = Math.min(imageIndex, Math.max(0, images.length - 1))
  const hero = images[activeIndex]
  const [quantity, setQuantity] = useState(1)
  const [message, setMessage] = useState<"added" | "error" | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [origin, setOrigin] = useState("50% 50%")
  const title = localizedText(product, "title", product.title, locale)
  const description = localizedText(product, "description", product.description ?? "", locale).replace(/<[^>]*>/g, " ")
  const limit = stockLimit(variant)
  const inCart = cart?.items?.filter(item => item.variant_id === variant?.id).reduce((n, item) => n + item.quantity, 0) ?? 0
  const remaining = limit === null ? undefined : Math.max(0, limit - inCart)
  const purchasable = canPurchase(variant) && remaining !== 0
  function selectVariant(id: string) {
    setVariantId(id); setImageIndex(0); setQuantity(1); setMessage(null)
    const next = variants.find(v => v.id === id)
    setSelectedOptions(Object.fromEntries((next?.options ?? []).map(o => [o.option_id, o.value])))
    const url = new URL(window.location.href)
    url.searchParams.set("v_id", id)
    window.history.replaceState(null, "", url)
  }
  function moveImage(delta: number) { setImageIndex((activeIndex + delta + images.length) % images.length) }
  return <div className="product-layout">
    <div className={`product-gallery${images.length > 1 ? "" : " product-gallery-single"}`}>
      <button type="button" disabled={!hero} onClick={() => dialog.current?.showModal()} aria-label={t("product.zoom")}
        onPointerMove={event => { if (event.pointerType === "mouse") { const r = event.currentTarget.getBoundingClientRect(); setOrigin(`${(event.clientX - r.left) / r.width * 100}% ${(event.clientY - r.top) / r.height * 100}%`) } }}
        className="group relative block product-hero w-full cursor-zoom-in overflow-hidden bg-[var(--store-bg-muted)]">
        <div className="h-full w-full transition-transform duration-200 [@media(hover:hover)]:group-hover:scale-[1.8]" style={{ transformOrigin: origin }}><ProductImage src={hero?.url} alt={title} eager className="h-full w-full object-cover" /></div>
      </button>
      {images.length > 1 && <div className="product-thumbnails" aria-label={t("product.photos")}>
        {images.map((image, index) => <button key={image.url} type="button" onClick={() => setImageIndex(index)} aria-label={t("product.photoNumber", { n: index + 1 })} aria-pressed={index === activeIndex} className="product-thumbnail"><ProductImage src={image.url} alt={t("product.photoNumber", { n: index + 1 })} className="h-full w-full object-contain" /></button>)}
      </div>}
      <dialog ref={dialog} className="fixed inset-0 m-auto h-[90dvh] w-[94vw] max-w-5xl rounded bg-white p-4 backdrop:bg-black/75" aria-label={t("product.photos")} onKeyDown={event => { if (images.length > 1 && ["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); moveImage(event.key === "ArrowRight" ? 1 : -1) } }}>
        <div className="flex h-full flex-col"><div className="flex items-center justify-between gap-4"><span>{activeIndex + 1} / {images.length}</span><button type="button" onClick={() => dialog.current?.close()} className="rounded border px-4 py-2">{t("common.close")}</button></div>
          <div className="min-h-0 flex-1"><ProductImage src={hero?.url} alt={title} eager className="h-full w-full object-contain" /></div>
          {images.length > 1 && <div className="flex justify-between"><button type="button" onClick={() => moveImage(-1)} className="rounded border px-4 py-2">← {t("common.previous")}</button><button type="button" onClick={() => moveImage(1)} className="rounded border px-4 py-2">{t("common.next")} →</button></div>}
        </div>
      </dialog>
    </div>
    <div className="product-summary">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <div className="mt-4">{ratingSummary}</div>
      {productBrand(product.metadata) && <p className="mt-2 break-words text-sm text-[var(--store-text-muted)]">{t("product.brand")}: {productBrand(product.metadata)}</p>}
      {variant?.sku && <p className="mt-2 text-xs text-[var(--store-text-muted)]">SKU: {variant.sku}</p>}
      <p className="product-price mt-6 font-semibold">{variant?.calculated_price ? formatMoney(variantAmount(variant.calculated_price), variant.calculated_price.currency_code, locale === "sr" ? "sr-Latn-RS" : "en-GB") : t("product.priceOnRequest")}</p>
      {(product.options ?? []).map(option => <fieldset key={option.id} className="mt-6"><legend className="text-sm font-semibold">{optionLabel(option.title, locale)}{isColorOption(option.title) && selectedOptions[option.id] ? `: ${selectedOptions[option.id]}` : ""}</legend><div className="mt-2 flex flex-wrap gap-2">
        {[...new Set((option.values ?? []).map(value => value.value))].map(value => {
          const swatch = isColorOption(option.title) ? colorSwatch(value) : undefined
          const selected = selectedOptions[option.id] === value
          const target = matchingVariant(variants, variant, option.id, value)
          const exists = variants.some(v => v.options?.some(o => o.option_id === option.id && o.value === value))
          return <button type="button" key={value} disabled={!exists} aria-pressed={Boolean(selected)} onClick={() => {
            if (target && variant) { selectVariant(target.id); return }
            const next = { ...selectedOptions, [option.id]: value }
            setSelectedOptions(next); setImageIndex(0); setQuantity(1); setMessage(null)
            const matched = variants.find(v => (product.options ?? []).every(o =>
              v.options?.some(choice => choice.option_id === o.id && choice.value === next[o.id])))
            const url = new URL(window.location.href)
            if (matched) url.searchParams.set("v_id", matched.id)
            else return
            window.history.replaceState(null, "", url)
          }} title={value} aria-label={value} className={swatch ? "color-choice" : "size-chip disabled:opacity-30"}>{swatch ? <ColorSwatch color={swatch} selected={Boolean(selected)} /> : value === "One size" ? t("product.oneSize") : value}</button>
        })}
      </div></fieldset>)}
      {!product.options?.length && variants.length > 1 && <label className="mt-6 grid gap-2">{t("product.variant")}<select value={variant?.id} onChange={e => selectVariant(e.target.value)} className="rounded border p-3">{variants.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}</select></label>}
      <p className="mt-6 text-sm" aria-live="polite">{limit === null ? variant?.allow_backorder ? t("product.backorder") : t("product.available") : limit > 0 ? t("product.inStock", { n: limit }) : t("product.outOfStock")}</p>
      {inCart > 0 && <p className="mt-1 text-sm text-[var(--store-text-muted)]">{t("product.alreadyInCart", { n: inCart })}</p>}
      <div className="mt-6 flex items-center justify-between gap-3 text-sm"><label htmlFor="product-quantity">{t("product.quantity")}</label><div className="quantity-stepper"><button type="button" className="quantity-button" disabled={!purchasable || isMutating || quantity <= 1} aria-label={t("cartPage.decreaseQty")} onClick={() => setQuantity(n => Math.max(1, n - 1))}>−</button><input id="product-quantity" type="number" min={1} max={remaining} step={1} value={quantity} disabled={!purchasable || isMutating} onChange={e => setQuantity(Math.max(1, Math.min(remaining ?? Number.MAX_SAFE_INTEGER, Math.floor(Number(e.target.value) || 1))))} className="quantity-value" /><button type="button" className="quantity-button" disabled={!purchasable || isMutating || (remaining !== undefined && quantity >= remaining)} aria-label={t("cartPage.increaseQty")} onClick={() => setQuantity(n => n + 1)}>+</button></div></div>
      <button type="button" disabled={!isReady || !pricingReady || isMutating || !purchasable || (remaining !== undefined && quantity > remaining)} onClick={async () => { setMessage(null); try { await addItem(variant!.id, quantity); setMessage("added"); setQuantity(1) } catch { setMessage("error") } }} className="button-primary mt-4 w-full disabled:opacity-40">{isMutating ? t("product.adding") : t("product.addToCart")}</button>
      <div className="mt-3 min-h-6 text-sm" aria-live="polite">{message === "added" && <Link href="/rs/cart" className="text-green-800 underline">{t("product.added")}</Link>}{message === "error" && <span role="alert" className="text-red-700">{t("product.addFailed")}</span>}</div>
      {description && <div className="product-description mt-6 text-sm leading-relaxed"><h2 className="mb-3 font-medium">{t("design.description")}</h2><p className="whitespace-pre-line text-[var(--store-text-muted)]">{description}</p></div>}
      <details className="product-policy"><summary>{t("design.delivery")} / {t("design.returns")}</summary><p className="text-[var(--store-text-muted)]">{t("product.deliveryTerms")}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--store-text-muted)]">{t("product.defectReturnTerms")}</p>
      <Link href="/terms" className="product-details-link mt-3">{t("design.delivery")} / {t("design.returns")} →</Link></details>
      <Link href="/rs/catalog" className="mt-6 inline-block text-sm underline">{t("product.backToCatalog")}</Link>
    </div>
  </div>
}
