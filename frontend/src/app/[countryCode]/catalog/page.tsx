import Link from "next/link"
import { ProductImage } from "@/components/store/ProductImage"
import { localizedText } from "@/lib/i18n/content"
import { canPurchase } from "@/lib/store/commerce"
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
  searchParams: Promise<{ category_id?: string; page?: string; q?: string }>
}) {
  const { t, locale } = await getTranslations()
  const { countryCode } = await params
  const { category_id: categoryIdParam, page: pageParam, q } = await searchParams
  const page = Math.max(1, Math.min(100000, Number.parseInt(pageParam ?? "1", 10) || 1))
  const cc = countryCode.toLowerCase()

  if (cc !== "rs") {
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

  const region = cc === "rs" ? cc : undefined
  const categoryId = categoryIdParam?.trim() || undefined

  const activeCategory = categoryId
    ? await getStoreProductCategoryById(categoryId, locale)
    : null

  const { products, count } = await listProductsByCountry({
    countryCode: cc,
    limit: 24,
    offset: (page - 1) * 24,
    locale,
    q: q?.trim() || undefined,
    categoryId,
  })

  const catalogHref = `/${cc}/catalog`
  const emptyHint = categoryId
    ? activeCategory
      ? t("catalog.emptyCategory", { name: activeCategory.name })
      : t("catalog.emptyCategoryMissing")
    : t("catalog.emptyDefault")

  const regionLabel =
    t("catalog.regionRs")

  const pages = Math.max(1, Math.ceil(count / 24))
  const pageHref = (n: number) => {
    const query = new URLSearchParams({ page: String(n) })
    if (categoryId) query.set("category_id", categoryId)
    if (q) query.set("q", q)
    return `/rs/catalog?${query}`
  }

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
          {regionLabel} · {t("catalog.count", { n: count })}
        </p>
      </div>

      <form action="/rs/catalog" className="mx-4 mt-5 flex max-w-xl gap-2 sm:mx-6">
        {categoryId && <input type="hidden" name="category_id" value={categoryId} />}
        <input key={q ?? ""} name="q" defaultValue={q} aria-label={t("catalog.search")} placeholder={t("catalog.searchPlaceholder")} className="h-11 min-w-0 flex-1 rounded-xl border bg-white px-3 text-sm" />
        <button className="rounded-xl bg-[var(--store-text)] px-4 text-sm font-semibold text-white">{t("catalog.search")}</button>
      </form>
      <div className="px-4 py-8 sm:px-6">
        {products.length === 0 ? (
          <div className="rounded-2xl border border-[var(--store-border)] bg-white p-10 text-center text-[var(--store-text-muted)]">
            {emptyHint}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => {
              const primaryVariant = p.variants?.find(canPurchase) ?? p.variants?.[0]
              const calculated = primaryVariant?.calculated_price
              const title = localizedText(p, "title", p.title, locale)
              const imgUrl = getStoreProductImageUrl(p)

              return (
                <li key={p.id}>
                  <Link
                    href={`/rs/products/${encodeURIComponent(p.handle)}`}
                    className="group block cursor-pointer overflow-hidden rounded-2xl border border-[var(--store-border)] bg-white shadow-sm transition hover:border-[var(--store-accent)] hover:shadow-md"
                  >
                    <div className="relative aspect-[3/4] overflow-hidden bg-[var(--store-bg-muted)]">
                      {imgUrl ? (
                        <ProductImage src={imgUrl} alt={title} className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-110" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-[var(--store-text-muted)]">
                          {t("catalog.noPhoto")}
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-[var(--store-text)]">
                        {title}
                      </p>
                      {calculated ? (
                        <p className="mt-2 text-sm font-semibold text-[var(--store-text)]">
                          {formatMoney(
                            calculated.calculated_amount,
                            calculated.currency_code,
                            locale === "sr" ? "sr-Latn-RS" : "en-GB"
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
      {pages > 1 && <nav className="mb-8 flex items-center justify-center gap-4 text-sm" aria-label={t("catalog.page", { n: page, total: pages })}>
        {page > 1 && <Link href={pageHref(Math.min(page - 1, pages))} className="rounded-full border px-4 py-2">← {t("common.previous")}</Link>}
        <span>{t("catalog.page", { n: page, total: pages })}</span>
        {page < pages && <Link href={pageHref(page + 1)} className="rounded-full border px-4 py-2">{t("common.next")} →</Link>}
      </nav>}
    </StoreShell>
  )
}

import type { Metadata } from "next"
import { siteUrl } from "@/lib/seo"

export async function generateMetadata({ searchParams }: {
  searchParams: Promise<{ category_id?: string; page?: string; q?: string }>
}): Promise<Metadata> {
  const query = await searchParams
  const { locale, t } = await getTranslations()
  const category = query.category_id?.trim() ? await getStoreProductCategoryById(query.category_id.trim(), locale) : null
  const canonical = new URL(siteUrl("/"))
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page || "1", 10) || 1))
  if (query.category_id || page > 1) canonical.pathname = "/rs/catalog"
  if (query.category_id) canonical.searchParams.set("category_id", query.category_id.trim())
  if (page > 1) canonical.searchParams.set("page", String(page))
  return { title: (category?.name || t("catalog.catalog")) + " | Tamir",
    alternates: { canonical: canonical.href },
    ...(query.q?.trim() ? { robots: { index: false, follow: true } } : {}) }
}
