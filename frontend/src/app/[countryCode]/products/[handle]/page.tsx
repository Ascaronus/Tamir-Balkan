import type { Metadata } from "next"
import { cache } from "react"
import { localizedText } from "@/lib/i18n/content"
import { getImagesForVariant } from "@/lib/product-image"
import { stockLimit } from "@/lib/store/commerce"
import { siteUrl, serializeJsonLd } from "@/lib/seo"
import type { Locale } from "@/lib/i18n/config"
import Link from "next/link"
import { notFound } from "next/navigation"
import { listProductsByCountry } from "@/lib/store/products"
import { StoreShell } from "@/components/store/StoreShell"
import { getTranslations } from "@/lib/i18n/server"
import { ProductDetails } from "@/components/product/ProductDetails"

const getProduct = cache(async (handle: string, locale: Locale) => {
  const { products } = await listProductsByCountry({ countryCode: "rs", handle, limit: 1, locale })
  return products[0]
})

export async function generateMetadata({ params }: {
  params: Promise<{ countryCode: string; handle: string }>
}): Promise<Metadata> {
  const { countryCode, handle } = await params
  if (countryCode.toLowerCase() !== "rs") notFound()
  const { locale } = await getTranslations()
  const product = await getProduct(handle, locale)
  if (!product) notFound()
  const title = localizedText(product, "title", product.title, locale)
  const description = localizedText(product, "description", product.description || title, locale).replace(/<[^>]*>/g, "").slice(0, 160)
  const url = siteUrl("/rs/products/" + encodeURIComponent(handle))
  const images = getImagesForVariant(product).map(image => image.url)
  return { title: title + " | Tamir", description, alternates: { canonical: url },
    openGraph: { title, description, url, images, type: "website" },
    twitter: { card: "summary_large_image", title, description, images } }
}

export const dynamic = "force-dynamic"
export default async function ProductPage({ params, searchParams }: {
  params: Promise<{ countryCode: string; handle: string }>
  searchParams: Promise<{ v_id?: string }>
}) {
  const { t, locale } = await getTranslations()
  const { countryCode, handle } = await params
  if (countryCode.toLowerCase() !== "rs") notFound()
  const product = await getProduct(handle, locale)
  if (!product) notFound()
  const url = siteUrl("/rs/products/" + encodeURIComponent(handle))
  const structuredData = {
    "@context": "https://schema.org", "@type": "Product",
    name: localizedText(product, "title", product.title, locale),
    description: localizedText(product, "description", product.description || product.title, locale),
    image: getImagesForVariant(product).map(image => image.url),
    url,
    offers: (product.variants || []).flatMap(variant => {
      const price = variant.calculated_price
      if (!price || typeof price.calculated_amount !== "number" || !price.currency_code || !Number.isFinite(price.calculated_amount) || price.calculated_amount < 0) return []
      return [{ "@type": "Offer", price: price.calculated_amount,
        priceCurrency: price.currency_code.toUpperCase(),
        url: url + "?v_id=" + encodeURIComponent(variant.id),
        sku: variant.sku || undefined,
        availability: "https://schema.org/" + (stockLimit(variant) === 0 ? "OutOfStock" : variant.allow_backorder ? "BackOrder" : "InStock") }]
    }),
  }
  return <StoreShell countryCode="rs">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
    <nav className="border-b bg-[var(--store-bg-muted)] px-6 py-5 text-sm"><Link href="/rs/catalog">{t("product.catalog")}</Link></nav>
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><ProductDetails key={product.id} product={product} initialVariantId={(await searchParams).v_id} /></div>
  </StoreShell>
}
