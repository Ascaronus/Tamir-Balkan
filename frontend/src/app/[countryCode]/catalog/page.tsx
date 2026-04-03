import Link from "next/link"
import Image from "next/image"
import { listProductsByCountry } from "@/lib/store/products"
import { getStoreProductCategoryById } from "@/lib/store/categories"
import { StoreShell } from "@/components/store/StoreShell"
import { formatMoney } from "@/lib/format-money"
import { getStoreProductImageUrl } from "@/lib/product-image"
import { getTranslations } from "@/lib/i18n/server"

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ category_id?: string }>
}) {
  const { t, locale } = await getTranslations()
  const { countryCode } = await params
  const { category_id: categoryIdParam } = await searchParams
  const cc = countryCode.toLowerCase()

  if (cc !== "rs" && cc !== "me") {
    return (
      <StoreShell>
        <div className="px-4 py-10">
          <Link
            href="/"
            className="text-sm text-[var(--store-text-muted)] underline-offset-4 hover:underline"
          >
            {t("catalog.backHome")}
          </Link>
          <h1 className="mt-4 text-xl font-semibold text-[var(--store-text)]">
            {t("catalog.unsupportedTitle")}
          </h1>
        </div>
      </StoreShell>
    )
  }

  const region = cc === "rs" || cc === "me" ? cc : undefined
  const categoryId = categoryIdParam?.trim() || undefined

  const activeCategory = categoryId
    ? await getStoreProductCategoryById(categoryId, locale)
    : null

  const { products } = await listProductsByCountry({
    countryCode: cc,
    limit: 24,
    offset: 0,
    categoryId,
  })

  const catalogHref = `/${cc}/catalog`
  const emptyHint = categoryId
    ? activeCategory
      ? t("catalog.emptyCategory", { name: activeCategory.name })
      : t("catalog.emptyCategoryMissing")
    : t("catalog.emptyDefault")

  const regionLabel =
    cc === "rs" ? t("catalog.regionRs") : t("catalog.regionMe")

  return (
    <StoreShell countryCode={region}>
      <div className="border-b border-[var(--store-border)] bg-[var(--store-bg-muted)] px-4 py-8 sm:px-6">
        <nav className="text-sm text-[var(--store-text-muted)]">
          <Link href="/" className="hover:text-[var(--store-text)]">
            {t("catalog.home")}
          </Link>
          <span className="mx-2">/</span>
          <Link href={catalogHref} className="hover:text-[var(--store-text)]">
            {t("catalog.catalog")}
          </Link>
          {activeCategory ? (
            <>
              <span className="mx-2">/</span>
              <span className="text-[var(--store-text)]">
                {activeCategory.name}
              </span>
            </>
          ) : null}
        </nav>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--store-text)] sm:text-3xl">
          {activeCategory ? activeCategory.name : t("catalog.catalog")}
        </h1>
        <p className="mt-2 text-sm text-[var(--store-text-muted)]">
          {t("catalog.region")} {regionLabel}
        </p>
      </div>

      <div className="px-4 py-8 sm:px-6">
        {products.length === 0 ? (
          <div className="rounded-2xl border border-[var(--store-border)] bg-white p-10 text-center text-[var(--store-text-muted)]">
            {emptyHint}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => {
              const primaryVariant = p.variants?.[0]
              const calculated = primaryVariant?.calculated_price
              const variantId = primaryVariant?.id
              const imgUrl = getStoreProductImageUrl(p)

              return (
                <li key={p.id}>
                  <Link
                    href={
                      variantId
                        ? `/${cc}/products/${encodeURIComponent(p.handle)}?v_id=${variantId}`
                        : `/${cc}/products/${encodeURIComponent(p.handle)}`
                    }
                    className="group block cursor-pointer overflow-hidden rounded-2xl border border-[var(--store-border)] bg-white shadow-sm transition hover:border-[var(--store-accent)] hover:shadow-md"
                  >
                    <div className="relative aspect-[3/4] bg-[var(--store-bg-muted)]">
                      {imgUrl ? (
                        <Image
                          src={imgUrl}
                          alt={p.title}
                          fill
                          sizes="(max-width: 640px) 50vw, 25vw"
                          className="pointer-events-none object-cover transition duration-300 group-hover:scale-[1.02] select-none"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-[var(--store-text-muted)]">
                          {t("catalog.noPhoto")}
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-[var(--store-text)]">
                        {p.title}
                      </p>
                      {calculated ? (
                        <p className="mt-2 text-sm font-semibold text-[var(--store-text)]">
                          {formatMoney(
                            calculated.calculated_amount,
                            calculated.currency_code
                          )}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--store-text-muted)]">
                          {t("catalog.priceOnRequest")}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </StoreShell>
  )
}
