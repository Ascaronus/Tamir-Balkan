"use client"

import Link from "next/link"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { Stars, ReviewIcon } from "@/components/reviews/Stars"
import { colorSwatch, isColorOption, type CatalogProduct } from "@/lib/store/catalog"
import { canPurchase, matchingVariant } from "@/lib/store/commerce"
import { formatMoney } from "@/lib/format-money"
import { localizedText } from "@/lib/i18n/content"
import { getStoreProductImageUrl } from "@/lib/product-image"
import type { Summary } from "@/lib/reviews/client"
import { ProductImage } from "./ProductImage"

export function ProductCard({ product, summary }: { product: CatalogProduct; summary?: Summary | null }) {
  const { t, locale } = useLocaleContext()
  const title = localizedText(product, "title", product.title, locale)
  const variant = product.catalog.preferred_variant_id
  const href = `/rs/products/${encodeURIComponent(product.handle)}${variant ? `?v_id=${encodeURIComponent(variant)}` : ""}`
  const variants = product.variants ?? []
  const preferred = variants.find(v => v.id === variant)
  const colors = (product.options ?? []).filter(o => isColorOption(o.title)).flatMap(option =>
    [...new Set(option.values?.map(v => v.value) ?? [])].map(value => ({ optionId: option.id, value })))

  return <li className="product-card">
    <Link className="product-card-image" href={href}>
      <ProductImage src={getStoreProductImageUrl(product)} alt={title} className="h-full w-full object-cover" />
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
        const target = matchingVariant(candidates, preferred, optionId, value) ?? candidates.find(canPurchase) ?? candidates[0]
        const content = swatch ? <span aria-hidden="true" className="color-mini" style={{ backgroundColor: swatch }} /> : <span>{value}</span>
        return target
          ? <Link key={`${optionId}:${value}`} href={`/rs/products/${encodeURIComponent(product.handle)}?v_id=${encodeURIComponent(target.id)}`} prefetch={false} className="product-card-color-link" title={value} aria-label={`${t("design.color")}: ${value}`}>{content}</Link>
          : <span key={`${optionId}:${value}`} className="product-card-color-link unavailable" title={value} aria-label={`${t("design.color")}: ${value}`} aria-disabled="true">{content}</span>
      })}
    </div>}
    <p className="product-card-price">{product.catalog.price === null
      ? t("catalog.priceOnRequest")
      : formatMoney(product.catalog.price, product.catalog.currency_code, locale === "sr" ? "sr-Latn-RS" : "en-GB")}</p>
  </li>
}
