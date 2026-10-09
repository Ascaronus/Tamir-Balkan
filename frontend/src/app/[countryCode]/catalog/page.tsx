import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { reviewSummaries } from "@/lib/reviews/server"
import { normalizeCatalogQuery, type CatalogQuery } from "@/lib/store/search-params"
import { catalogSelection, catalogParams, fetchCatalog } from "@/lib/store/catalog"
import { getRegionByCountry } from "@/lib/store/regions"
import { getStoreProductCategoryById, listStoreProductCategories } from "@/lib/store/categories"
import { listProductsByCountry } from "@/lib/store/products"
import { StoreShell } from "@/components/store/StoreShell"
import { CatalogClient } from "@/components/store/CatalogClient"
import { getTranslations } from "@/lib/i18n/server"

export default async function CatalogPage({ params, searchParams }: {
  params: Promise<{ countryCode: string }>; searchParams: Promise<CatalogQuery>
}) {
  if ((await params).countryCode.toLowerCase() !== "rs") notFound()
  const { t, locale } = await getTranslations()
  const selection = catalogSelection(await searchParams)
  const [region, category, categories] = await Promise.all([
    getRegionByCountry("rs").catch(() => null),
    selection.category_id ? getStoreProductCategoryById(selection.category_id, locale) : null,
    listStoreProductCategories(locale).catch(() => []),
  ])
  if (selection.category_id && !category) notFound()
  const initial = region ? await fetchCatalog(selection, region.id, locale).catch(() => null) : null
  const summaries = initial ? await reviewSummaries(initial.products.map(p => p.id)) : null
  return <StoreShell countryCode="rs" initialCategories={categories} activeCategoryId={selection.category_id}><div className="store-container catalog-page">
    {!selection.category_id && !selection.q && <section className="collection-banner" aria-label={t("design.heroTitle")}><div className="collection-copy"><h2>{t("design.heroTitle")}</h2><p>{t("design.heroSubtitle")}</p><Link href="#catalog-products" className="button-secondary">{t("design.heroAction")}</Link></div><div className="collection-image"><Image src="/design/tamir-family-winter.webp" alt={t("design.heroAlt")} fill sizes="100vw" unoptimized preload /></div></section>}
    <CatalogClient key={catalogParams(selection).toString() + locale} initial={initial} selection={selection} regionId={region?.id ?? ""} summaries={summaries} title={category?.name || t("sidebar.allProducts")} />
  </div></StoreShell>
}

import type { Metadata } from "next"
import { siteUrl } from "@/lib/seo"

export async function generateMetadata({ searchParams }: {
  searchParams: Promise<CatalogQuery>
}): Promise<Metadata> {
  const query = normalizeCatalogQuery(await searchParams)
  const { locale, t } = await getTranslations()
  const category = query.category_id?.trim() ? await getStoreProductCategoryById(query.category_id.trim(), locale) : null
  if (query.category_id && !category) notFound()
  const categoryCount = category ? (await listProductsByCountry({ countryCode: "rs", categoryId: category.id, limit: 1, locale })).count : null
  const canonical = new URL(siteUrl("/"))
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page || "1", 10) || 1))
  if (query.category_id || page > 1) canonical.pathname = "/rs/catalog"
  if (query.category_id) canonical.searchParams.set("category_id", query.category_id.trim())
  if (page > 1) canonical.searchParams.set("page", String(page))
  const description = category
    ? locale === "sr" ? `${category.name} — TAMIR kolekcija. Pogledajte modele, boje, veličine i cene. Dostava širom Srbije.` : `${category.name} — TAMIR collection. Browse styles, colors, sizes and prices. Delivery across Serbia.`
    : locale === "sr" ? "TAMIR muška odeća i aksesoari. Pogledajte kolekciju, boje, veličine i cene. Dostava širom Srbije." : "TAMIR men's clothing and accessories. Browse the collection, colors, sizes and prices. Delivery across Serbia."
  return { title: (category?.name || t("catalog.catalog")) + " | Tamir", description,
    alternates: { canonical: canonical.href },
    // Search results and empty categories have no useful standalone search landing page.
    // This is evaluated against published products on every request, so a populated category becomes indexable automatically.
    robots: { index: !query.q?.trim() && categoryCount !== 0, follow: true } }
}
