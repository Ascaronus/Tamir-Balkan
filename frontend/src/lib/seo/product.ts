import type { HttpTypes } from "@medusajs/types"
import type { Locale } from "@/lib/i18n/config"
import type { ReviewList } from "@/lib/reviews/client"
import { localizedText } from "@/lib/i18n/content"
import { getImagesForVariant } from "@/lib/product-image"
import { stockLimit, variantAmount } from "@/lib/store/commerce"

/** Merchant confirmed TAMIR as the catalogue brand; explicit product values can override it. */
export function productBrand(metadata: HttpTypes.StoreProduct["metadata"]): string | undefined {
  for (const value of [metadata?.brand, metadata?.rozetka_vendor]) {
    if (typeof value === "string" && value.trim() && value.trim().length <= 100) return value.trim()
  }
  return "TAMIR"
}

/** Keep leading zeroes and reject internal SKUs and invalid check digits. */
export function validGtin(value: unknown): string | undefined {
  if (typeof value !== "string") return
  const code = value.trim()
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code) || /^0+$/.test(code)) return
  const digits = [...code].map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - sum % 10) % 10 === check ? code : undefined
}

export function productJsonLd(product: HttpTypes.StoreProduct, locale: Locale, url: string, reviews: ReviewList | null) {
  const variants = product.variants || []
  const offers = variants.flatMap(variant => {
    const price = variant.calculated_price
    const amount = variantAmount(price)
    if (!price || typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || !price.currency_code || !/^[a-z]{3}$/i.test(price.currency_code)) return []
    return [{ "@type": "Offer", price: amount, priceCurrency: price.currency_code.toUpperCase(),
      url: url + "?v_id=" + encodeURIComponent(variant.id), sku: variant.sku || undefined,
      ...(price.currency_code.toUpperCase() === "RSD" ? { shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "RS" },
        shippingRate: { "@type": "MonetaryAmount", value: 300, currency: "RSD" },
        deliveryTime: { "@type": "ShippingDeliveryTime",
          // No separate handling-time promise has been supplied. Transit cannot
          // exceed the merchant's confirmed seven-day total delivery window.
          transitTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 7, unitCode: "DAY" },
        },
      } } : {}),
      availability: "https://schema.org/" + (stockLimit(variant) === 0 ? "OutOfStock" : variant.allow_backorder ? "BackOrder" : "InStock") }]
  })
  const aggregateRating = reviews && Number.isSafeInteger(reviews.count) && reviews.count > 0 && Number.isFinite(reviews.rating) && reviews.rating >= 1 && reviews.rating <= 5
    ? { "@type": "AggregateRating", ratingValue: Math.round(reviews.rating * 10) / 10, reviewCount: reviews.count, bestRating: 5, worstRating: 1 } : undefined
  // Only the public endpoint's published reviews; never copy account fields.
  const review = (reviews?.reviews || []).flatMap(item => {
    if (!item.name?.trim() || item.name.includes("@") || !item.body?.trim() || !Number.isInteger(item.rating) || item.rating < 1 || item.rating > 5 || !Number.isFinite(Date.parse(item.created_at))) return []
    return [{ "@type": "Review", author: { "@type": "Person", name: item.name }, reviewBody: item.body,
      datePublished: new Date(item.created_at).toISOString(),
      reviewRating: { "@type": "Rating", ratingValue: item.rating, bestRating: 5, worstRating: 1 } }]
  })
  // An incomplete Product is invalid for Google's product snippets. The normal
  // page remains indexable while the merchant supplies a price or gets reviews.
  if (!offers.length && !aggregateRating && !review.length) return null
  const brand = productBrand(product.metadata)
  const onlyVariant = variants.length === 1 ? variants[0] : undefined
  const gtin = [onlyVariant?.ean, onlyVariant?.upc, onlyVariant?.barcode, product.metadata?.gtin].map(validGtin).find(Boolean)
  return {
    "@context": "https://schema.org", "@type": "Product", "@id": url + "#product", url,
    name: localizedText(product, "title", product.title, locale),
    description: localizedText(product, "description", product.description || product.title, locale).replace(/<[^>]*>/g, ""),
    image: getImagesForVariant(product).map(image => image.url),
    ...(onlyVariant?.sku ? { sku: onlyVariant.sku } : {}),
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    ...(gtin ? { ["gtin" + gtin.length]: gtin } : {}),
    ...(offers.length ? { offers } : {}), ...(aggregateRating ? { aggregateRating } : {}),
    ...(review.length ? { review } : {}),
  }
}
