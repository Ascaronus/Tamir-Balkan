import { Stars, ReviewIcon } from "@/components/reviews/Stars"
import { productReviews } from "@/lib/reviews/server"
import { ProductReviews } from "@/components/reviews/ProductReviews"
import type { Metadata } from "next"
import { cache } from "react"
import { localizedText } from "@/lib/i18n/content"
import { getImagesForVariant } from "@/lib/product-image"
import { productJsonLd } from "@/lib/seo/product"
import { siteUrl, serializeJsonLd } from "@/lib/seo"
import type { Locale } from "@/lib/i18n/config"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import { sdk } from "@/lib/medusa"
import { listProductsByCountry } from "@/lib/store/products"
import { StoreShell } from "@/components/store/StoreShell"
import { getTranslations } from "@/lib/i18n/server"
import { RelatedProducts } from "@/components/product/RelatedProducts"
import { ProductDetails } from "@/components/product/ProductDetails"

const getProduct = cache(async (handle: string, locale: Locale) => {
  const { products } = await listProductsByCountry({ countryCode: "rs", handle, limit: 1, locale })
  if (products[0] || !/^rozetka-[a-f0-9]{16,20}$/.test(handle)) return products[0]
  const alias = await sdk.client.fetch<{ handle: string }>(`/store/product-redirects/${encodeURIComponent(handle)}`, { cache: "no-store" })
    .catch((error: { status?: number }) => { if (error.status === 404) return null; throw error })
  if (!alias?.handle || alias.handle === handle) return undefined
  // The normal Store query still enforces publication and sales-channel access.
  return (await listProductsByCountry({ countryCode: "rs", handle: alias.handle, limit: 1, locale })).products[0]
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
  const url = siteUrl("/rs/products/" + encodeURIComponent(product.handle))
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
  if (product.handle !== handle) {
    const variant = (await searchParams).v_id
    const suffix = variant && product.variants?.some(v => v.id === variant) && product.variants.length > 1 ? `?v_id=${encodeURIComponent(variant)}` : ""
    permanentRedirect(`/rs/products/${encodeURIComponent(product.handle)}${suffix}`)
  }
  const url = siteUrl("/rs/products/" + encodeURIComponent(product.handle))
  const reviews = await productReviews(product.id)
  const reviewSummary = reviews ? { count: reviews.count, rating: reviews.rating } : null
  const structuredData = productJsonLd(product, locale, url, reviews)
  return <StoreShell countryCode="rs">
    {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />}
    <nav className="store-container pt-8 text-xs text-[var(--store-text-muted)]"><Link href="/rs/catalog">{t("product.catalog")}</Link></nav>
    <div className="page-content product-page"><ProductDetails key={product.id} product={product} ratingSummary={<Link href="#reviews" className="inline-flex flex-wrap items-center gap-2 text-xs"><ReviewIcon />{reviewSummary ? <><Stars rating={reviewSummary.rating} count={reviewSummary.count} emptyLabel={t("reviews.noRatings")} /><span>· {t("reviews.count", { n: reviewSummary.count })}</span></> : t("reviews.title")}</Link>} initialVariantId={(await searchParams).v_id} /><ProductReviews key={product.id} productId={product.id} initial={reviewSummary} initialReviews={reviews} /><RelatedProducts productId={product.id} /></div>
  </StoreShell>
}
