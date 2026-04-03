import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { getRegionByCountry } from "@/lib/store/regions"
import { listProductsByCountry } from "@/lib/store/products"
import { StoreShell } from "@/components/store/StoreShell"
import { formatMoney } from "@/lib/format-money"
import {
  getImagesForVariant,
  getStoreProductImageUrl,
} from "@/lib/product-image"
import { getTranslations } from "@/lib/i18n/server"

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ countryCode: string; handle: string }>
  searchParams: Promise<{ v_id?: string }>
}) {
  const { t } = await getTranslations()
  const { countryCode, handle } = await params
  const cc = countryCode.toLowerCase()
  const selectedVariantId = (await searchParams)?.v_id

  if (cc !== "rs" && cc !== "me") notFound()

  const region = await getRegionByCountry(cc)
  if (!region) notFound()

  const { products } = await listProductsByCountry({
    countryCode: cc,
    handle,
    limit: 10,
    offset: 0,
  })

  const product = products[0]
  if (!product) notFound()

  const selectedVariant =
    product.variants?.find((v) => v.id === selectedVariantId) ??
    product.variants?.[0]

  const calculated = selectedVariant?.calculated_price
  const images = getImagesForVariant(product, selectedVariant?.id)
  const heroUrl = images?.[0]?.url ?? getStoreProductImageUrl(product)

  const regionKey = cc === "rs" || cc === "me" ? cc : undefined

  return (
    <StoreShell countryCode={regionKey}>
      <div className="border-b border-[var(--store-border)] bg-[var(--store-bg-muted)] px-4 py-6 sm:px-6">
        <nav className="text-sm text-[var(--store-text-muted)]">
          <Link href="/" className="hover:text-[var(--store-text)]">
            {t("product.home")}
          </Link>
          <span className="mx-2">/</span>
          <Link href={`/${cc}/catalog`} className="hover:text-[var(--store-text)]">
            {t("product.catalog")}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-[var(--store-text)]">{product.title}</span>
        </nav>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-[var(--store-border)] bg-[var(--store-bg-muted)]">
            {heroUrl ? (
              <Image
                src={heroUrl}
                alt={product.title}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[var(--store-text-muted)]">
                {t("product.noPhoto")}
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--store-text)] sm:text-3xl">
              {product.title}
            </h1>

            {product.description ? (
              <p className="mt-4 text-sm leading-relaxed text-[var(--store-text-muted)]">
                {product.description.replace(/<[^>]+>/g, "").slice(0, 400)}
                {product.description.length > 400 ? "…" : ""}
              </p>
            ) : null}

            {calculated ? (
              <p className="mt-6 text-2xl font-semibold text-[var(--store-text)]">
                {formatMoney(
                  calculated.calculated_amount,
                  calculated.currency_code
                )}
              </p>
            ) : (
              <p className="mt-6 text-lg text-[var(--store-text-muted)]">
                {t("product.priceOnRequest")}
              </p>
            )}

            {product.variants && product.variants.length > 1 ? (
              <div className="mt-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--store-text-muted)]">
                  {t("product.variant")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.variants.map((v) => {
                    const active = v.id === selectedVariant?.id
                    return (
                      <Link
                        key={v.id}
                        href={`/${cc}/products/${encodeURIComponent(product.handle)}?v_id=${v.id}`}
                        className={`rounded-full border px-4 py-2 text-sm transition ${
                          active
                            ? "border-[var(--store-text)] bg-[var(--store-text)] text-white"
                            : "border-[var(--store-border)] bg-white text-[var(--store-text)] hover:border-[var(--store-accent)]"
                        }`}
                      >
                        {v.title ?? v.sku ?? v.id}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {typeof selectedVariant?.inventory_quantity === "number" ? (
              <p className="mt-6 text-sm text-[var(--store-text-muted)]">
                {t("product.inStock", {
                  n: selectedVariant.inventory_quantity,
                })}
              </p>
            ) : null}

            <div className="mt-10 flex flex-wrap gap-3">
              <button
                type="button"
                disabled
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--store-text)] px-8 text-sm font-semibold text-white opacity-60"
              >
                {t("product.addToCart")}
              </button>
              <Link
                href={`/${cc}/catalog`}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--store-border)] px-6 text-sm font-medium text-[var(--store-text)] hover:bg-[var(--store-bg-muted)]"
              >
                {t("product.backToCatalog")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </StoreShell>
  )
}
