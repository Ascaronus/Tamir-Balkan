import { categoryPath } from "@/lib/store/category-url"
import { getProductDelivery } from "@/lib/store/product-delivery"
import { productPath, productHandle, englishReady } from "@/lib/i18n/paths"
import { Stars, ReviewIcon } from "@/components/reviews/Stars"
import { productReviews } from "@/lib/reviews/server"
import { ProductReviews } from "@/components/reviews/ProductReviews"
import type { Metadata } from "next"
import { cache } from "react"
import { localizedText } from "@/lib/i18n/content"
import { getImagesForVariant } from "@/lib/product-image"
import { productJsonLd } from "@/lib/seo/product"
import { siteUrl, serializeJsonLd, languageAlternates } from "@/lib/seo"
import type { Locale } from "@/lib/i18n/config"
import Link from "@/components/i18n/LocalizedLink"
import { notFound } from "next/navigation"
import { sdk } from "@/lib/medusa"
import { listProductsByCountry } from "@/lib/store/products"
import { StoreShell } from "@/components/store/StoreShell"
import { getTranslations } from "@/lib/i18n/server"
import { RelatedProducts } from "@/components/product/RelatedProducts"
import { ProductDetails } from "@/components/product/ProductDetails"

const getProduct = cache(async (handle: string, locale: Locale) => {
  const { products } = await listProductsByCountry({ countryCode: "rs", handle, limit: 1, locale })
  if (products[0]) return productHandle(products[0], locale) === handle ? products[0] : undefined
  const alias = await sdk.client.fetch<{ handle: string }>(`/store/product-redirects/${encodeURIComponent(handle)}`, { cache: "no-store" })
    .catch((error: { status?: number }) => { if (error.status === 404) return null; throw error })
  if (!alias?.handle || alias.handle === handle) return undefined
  // The normal Store query still enforces publication and sales-channel access.
  const product = (await listProductsByCountry({ countryCode: "rs", handle: alias.handle, limit: 1, locale })).products[0]
  // Only the current address for the requested language is a public product URL.
  return product && productHandle(product, locale) === handle ? product : undefined
})

export async function generateMetadata({ params }: {
  params: Promise<{ countryCode: string; handle: string }>
}): Promise<Metadata> {
  const { countryCode, handle } = await params
  if (!["rs", "en"].includes(countryCode.toLowerCase())) notFound()
  const { locale } = await getTranslations()
  const product = await getProduct(handle, locale)
  if (!product) notFound()
  const title = localizedText(product, "title", product.title, locale)
  const description = localizedText(product, "description", product.description || title, locale).replace(/<[^>]*>/g, "").slice(0, 160)
  const url = siteUrl(productPath(product, locale))
  const images = getImagesForVariant(product).map(image => image.url)
  return { title: title + " | Tamir", description, alternates: englishReady(product) ? languageAlternates(productPath(product, "sr"), locale, productPath(product, "en")) : { canonical: url },
    robots: { index: locale === "sr" || englishReady(product), follow: true },
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
  if (!["rs", "en"].includes(countryCode.toLowerCase())) notFound()
  const product = await getProduct(handle, locale)
  if (!product) notFound()
  const url = siteUrl(productPath(product, locale))
  const [reviews, delivery] = await Promise.all([productReviews(product.id), getProductDelivery(product.id)])
  const reviewSummary = reviews ? { count: reviews.count, rating: reviews.rating } : null
  const structuredData = productJsonLd(product, locale, url, reviews, delivery)
  return <StoreShell countryCode="rs" languagePaths={{ sr: productPath(product, "sr"), en: productPath(product, "en") }}>
    {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />}
    <nav aria-label={t("product.catalog")} className="product-breadcrumbs store-container pt-8 text-xs text-[var(--store-text-muted)]"><Link href="/rs">{t("product.home")}</Link><span aria-hidden="true">/</span>{product.categories?.[0] ? <><Link href={categoryPath(product.categories[0], locale)}>{localizedText(product.categories[0], "name", product.categories[0].name, locale)}</Link><span aria-hidden="true">/</span></> : null}<span aria-current="page">{localizedText(product, "title", product.title, locale)}</span></nav>
    <div className="page-content product-page"><ProductDetails key={product.id} product={product} delivery={delivery} ratingSummary={<Link href="#reviews" className="inline-flex flex-wrap items-center gap-2 text-xs">{!reviewSummary && <ReviewIcon />}{reviewSummary ? <><Stars wide rating={reviewSummary.rating} count={reviewSummary.count} emptyLabel={t("reviews.noRatings")} />{reviewSummary.count > 0 && <span>· {t("reviews.count", { n: reviewSummary.count })}</span>}</> : t("reviews.title")}</Link>} initialVariantId={(await searchParams).v_id} /><ProductReviews key={product.id} productId={product.id} initial={reviewSummary} initialReviews={reviews} /><RelatedProducts productId={product.id} /></div>
  </StoreShell>
}
