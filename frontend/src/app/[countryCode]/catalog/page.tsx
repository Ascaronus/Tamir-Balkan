import { localizedPath } from "@/lib/i18n/paths"
import Image from "next/image"
import Link from "@/components/i18n/LocalizedLink"
import { notFound, permanentRedirect } from "next/navigation"
import { reviewSummaries } from "@/lib/reviews/server"
import { normalizeCatalogQuery, queryText, type CatalogQuery } from "@/lib/store/search-params"
import { catalogSelection, catalogParams, fetchCatalog } from "@/lib/store/catalog"
import { getRegionByCountry } from "@/lib/store/regions"
import { getStoreProductCategoryById, getStoreProductCategoryByHandle, listStoreProductCategories } from "@/lib/store/categories"
import { categoryPath, categoryRedirectPath } from "@/lib/store/category-url"
import { listProductsByCountry } from "@/lib/store/products"
import { StoreShell } from "@/components/store/StoreShell"
import { CatalogClient } from "@/components/store/CatalogClient"
import { getTranslations } from "@/lib/i18n/server"
import type { Locale } from "@/lib/i18n/config"

type CatalogRouteParams = { countryCode?: string; categoryHandle?: string }

async function resolveCategory(route: CatalogRouteParams, query: CatalogQuery, locale: Locale) {
  if (route.countryCode && route.countryCode.toLowerCase() !== "rs") notFound()
  const categoryId = queryText(query.category_id)
  const category = route.categoryHandle
    ? await getStoreProductCategoryByHandle(route.categoryHandle, locale)
    : categoryId ? await getStoreProductCategoryById(categoryId, locale) : null
  if ((route.categoryHandle || categoryId) && !category) notFound()
  if (category?.handle && (!route.categoryHandle || query.category_id !== undefined)) {
    permanentRedirect(localizedPath(categoryRedirectPath(category, query), locale))
  }
  return category
}

export default async function CatalogPage({ params, searchParams }: {
  params: Promise<CatalogRouteParams>; searchParams: Promise<CatalogQuery>
}) {
  const route = await params
  const query = await searchParams
  const { t, locale } = await getTranslations()
  const category = await resolveCategory(route, query, locale)
  const selection = catalogSelection({ ...query, category_id: category?.id })
  const basePath = localizedPath(category ? categoryPath(category) : "/rs/catalog", locale)
  const [region, categories] = await Promise.all([
    getRegionByCountry("rs").catch(() => null),
    listStoreProductCategories(locale).catch(() => []),
  ])
  const initial = region ? await fetchCatalog(selection, region.id, locale).catch(() => null) : null
  const summaries = initial ? await reviewSummaries(initial.products.map(p => p.id)) : null
  return <StoreShell countryCode="rs" initialCategories={categories} activeCategoryId={selection.category_id}><div className="store-container catalog-page">
    {!selection.category_id && !selection.q && <section className="collection-banner" aria-label={t("design.heroTitle")}><div className="collection-copy"><h2>{t("design.heroTitle")}</h2><p>{t("design.heroSubtitle")}</p><Link href="#catalog-products" className="button-secondary">{t("design.heroAction")}</Link></div><div className="collection-image"><Image src="/design/tamir-family-winter.webp" alt={t("design.heroAlt")} fill sizes="100vw" unoptimized preload /></div></section>}
    <CatalogClient key={catalogParams(selection).toString() + locale} initial={initial} selection={selection} basePath={basePath} regionId={region?.id ?? ""} summaries={summaries} title={category?.name || t("sidebar.allProducts")} />
  </div></StoreShell>
}

import type { Metadata } from "next"
import { siteUrl, languageAlternates } from "@/lib/seo"

export async function generateMetadata({ searchParams, params }: {
  searchParams: Promise<CatalogQuery>; params?: Promise<CatalogRouteParams>
}): Promise<Metadata> {
  const rawQuery = await searchParams
  const query = normalizeCatalogQuery(rawQuery)
  const { locale, t } = await getTranslations()
  const category = await resolveCategory(await params ?? {}, rawQuery, locale)
  const categoryCount = category ? (await listProductsByCountry({ countryCode: "rs", categoryId: category.id, limit: 1, locale })).count : null
  const canonical = new URL(siteUrl(category ? categoryPath(category) : "/"))
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page || "1", 10) || 1))
  if (!category && page > 1) canonical.pathname = "/rs/catalog"
  if (page > 1) canonical.searchParams.set("page", String(page))
  const description = category
    ? locale === "sr" ? `${category.name} — TAMIR kolekcija. Pogledajte modele, boje, veličine i cene. Dostava širom Srbije.` : `${category.name} — TAMIR collection. Browse styles, colors, sizes and prices. Delivery across Serbia.`
    : locale === "sr" ? "TAMIR muška odeća i aksesoari. Pogledajte kolekciju, boje, veličine i cene. Dostava širom Srbije." : "TAMIR men's clothing and accessories. Browse the collection, colors, sizes and prices. Delivery across Serbia."
  return { title: (category?.name || t("catalog.catalog")) + " | Tamir", description,
    alternates: languageAlternates(canonical.pathname + canonical.search, locale),
    // Search results and empty categories have no useful standalone search landing page.
    // This is evaluated against published products on every request, so a populated category becomes indexable automatically.
    robots: { index: !query.q?.trim() && categoryCount !== 0, follow: true } }
}
