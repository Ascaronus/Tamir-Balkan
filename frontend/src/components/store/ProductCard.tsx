"use client"

import Link from "next/link"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { Stars, ReviewIcon } from "@/components/reviews/Stars"
import { colorSwatch, isColorOption, type CatalogProduct } from "@/lib/store/catalog"
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
  const colors = [...new Set(product.options?.filter(o => isColorOption(o.title)).flatMap(o => o.values?.map(v => v.value) ?? []))]

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
      {colors.slice(0, 6).map(color => colorSwatch(color)
        ? <span key={color} title={color} aria-label={color} className="color-mini" style={{ backgroundColor: colorSwatch(color) }} />
        : <span key={color} className="text-xs text-[var(--store-text-muted)]">{color}</span>)}
    </div>}
    <p className="product-card-price">{product.catalog.price === null
      ? t("catalog.priceOnRequest")
      : formatMoney(product.catalog.price, product.catalog.currency_code, locale === "sr" ? "sr-Latn-RS" : "en-GB")}</p>
  </li>
}
