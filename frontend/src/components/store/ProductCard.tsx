"use client"

import { productPath } from "@/lib/i18n/paths"
import Link from "@/components/i18n/LocalizedLink"
import { useState } from "react"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { Stars, ReviewIcon } from "@/components/reviews/Stars"
import { colorSwatch, isColorOption, type CatalogProduct } from "@/lib/store/catalog"
import { canPurchase, matchingVariant, variantAmount } from "@/lib/store/commerce"
import { formatMoney } from "@/lib/format-money"
import { localizedText } from "@/lib/i18n/content"
import { getImagesForVariant, getStoreProductImageUrl } from "@/lib/product-image"
import type { Summary } from "@/lib/reviews/client"
import { ProductImage } from "./ProductImage"
import { ColorSwatch } from "./ColorSwatch"

export function ProductCard({ product, summary }: { product: CatalogProduct; summary?: Summary | null }) {
  const { t, locale } = useLocaleContext()
  const title = localizedText(product, "title", product.title, locale)
  const variants = product.variants ?? []
  const initialId = product.catalog.preferred_variant_id
  const context = `${product.id}:${initialId ?? ""}`
  const [selection, setSelection] = useState<{ context: string; id: string } | null>(null)
  const chosen = selection?.context === context ? variants.find(v => v.id === selection.id) : undefined
  const current = chosen ?? variants.find(v => v.id === initialId) ?? variants.find(canPurchase) ?? variants[0]
  const href = `${productPath(product, locale)}${current && variants.length > 1 ? `?v_id=${encodeURIComponent(current.id)}` : ""}`
  const image = current?.images?.length ? getImagesForVariant(product, current.id)[0]?.url : getStoreProductImageUrl(product)
  const price = chosen ? variantAmount(chosen.calculated_price) : product.catalog.price
  const colors = (product.options ?? []).filter(o => isColorOption(o.title)).flatMap(option =>
    [...new Set(option.values?.map(v => v.value) ?? [])].map(value => ({ optionId: option.id, value })))

  return <li className="product-card">
    <Link className="product-card-image" href={href}>
      <ProductImage src={image} alt={title} className="h-full w-full object-cover" />
    </Link>
    <Link href={href} className="product-card-title">{title}</Link>
    <Link className="product-card-rating" href={`${href}#reviews`} aria-label={t("reviews.show")}>
      <ReviewIcon />
      {summary ? <>
        <Stars compact rating={summary.rating} count={summary.count} emptyLabel={t("reviews.noRatings")} />
        <span>· {summary.count}</span>
      </> : t("reviews.title")}
    </Link>
    {colors.length > 0 && <div className="product-card-colors">
      {colors.slice(0, 6).map(({ optionId, value }) => {
        const swatch = colorSwatch(value)
        const candidates = variants.filter(v => v.options?.some(o => o.option_id === optionId && o.value === value))
        const target = matchingVariant(candidates, current, optionId, value) ?? candidates.find(canPurchase) ?? candidates[0]
        const selected = Boolean(current?.options?.some(o => o.option_id === optionId && o.value === value))
        const content = swatch ? <ColorSwatch color={swatch} selected={selected} compact /> : <span>{value}</span>
        return <button key={`${optionId}:${value}`} type="button" className="product-card-color-choice"
          disabled={!target} aria-pressed={selected} title={value} aria-label={`${t("design.color")}: ${value}`}
          onClick={() => { if (target) setSelection({ context, id: target.id }) }}>{content}</button>
      })}
    </div>}
    <p className="product-card-price">{price == null
      ? t("catalog.priceOnRequest")
      : formatMoney(price, product.catalog.currency_code, locale === "sr" ? "sr-Latn-RS" : "en-GB")}</p>
  </li>
}
