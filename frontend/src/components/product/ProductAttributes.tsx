"use client"

import type { HttpTypes } from "@medusajs/types"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"

// Display the product Attributes fields, not arbitrary (potentially internal) metadata.
// Medusa's built-in form does not specify measurement units; preserve its values.
export function ProductAttributes({ product }: { product: HttpTypes.StoreProduct }) {
  const { t, locale } = useLocaleContext()
  const rows: { key: string; value: string }[] = []
  for (const key of ["length", "width", "height", "weight"] as const) {
    const value = product[key]
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      rows.push({ key, value: new Intl.NumberFormat(locale === "sr" ? "sr-Latn-RS" : "en", { maximumFractionDigits: 20 }).format(value) })
    }
  }
  for (const key of ["origin_country", "mid_code", "hs_code"] as const) {
    const value = product[key]?.trim()
    if (!value) continue
    let display = value
    if (key === "origin_country" && /^[a-z]{2}$/i.test(value)) {
      display = new Intl.DisplayNames([locale === "sr" ? "sr-Latn" : "en"], { type: "region" }).of(value.toUpperCase()) ?? value
    }
    rows.push({ key, value: display })
  }
  if (!rows.length) return null
  return <details className="product-policy product-attributes"><summary>{t("product.attributes")}</summary>
    <dl>{rows.map(row => <div key={row.key}><dt>{t(`product.attributeLabels.${row.key}`)}</dt><dd>{row.value}</dd></div>)}</dl>
  </details>
}
