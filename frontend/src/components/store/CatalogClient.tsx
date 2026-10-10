"use client"
import { useEffect, useState, useTransition } from "react"
import Link from "@/components/i18n/LocalizedLink"
import { useLocalizedRouter as useRouter } from "@/components/i18n/useLocalizedRouter"
import { useAuth } from "@/components/auth/AuthProvider"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { getAuthToken } from "@/lib/auth/auth-storage"
import { catalogHref, catalogSorts, fetchCatalog, type CatalogResult, type CatalogSelection } from "@/lib/store/catalog"
import { reviewSummaries } from "@/lib/reviews/server"
import type { Summary } from "@/lib/reviews/client"
import { ProductCard } from "./ProductCard"
import { CatalogFilters } from "./CatalogFilters"
import { DesignIcon } from "./DesignIcon"

export function CatalogClient({ initial, selection, regionId, title, basePath = "/rs/catalog", summaries: initialSummaries }: { initial: CatalogResult | null; selection: CatalogSelection; regionId: string; title: string; basePath?: string; summaries: Record<string, Summary> | null }) {
  const { t, locale } = useLocaleContext()
  const { customer, isReady } = useAuth()
  const router = useRouter()
  const [data, setData] = useState(initial)
  const [summaries, setSummaries] = useState(initialSummaries)
  const [error, setError] = useState(!initial)
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    if (!isReady || (!customer && initial && !retry)) return
    const abort = new AbortController()
    Promise.resolve().then(() => {
      if (abort.signal.aborted) return
      setLoading(true); setError(false)
      return fetchCatalog(selection, regionId, locale, { token: getAuthToken(), signal: abort.signal })
    }).then(async next => {
      if (!next || abort.signal.aborted) return
      const ratings = await reviewSummaries(next.products.map(p => p.id))
      if (!abort.signal.aborted) { setData(next); setSummaries(ratings) }
    }).catch(() => { if (!abort.signal.aborted) setError(true) }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [customer, isReady, initial, selection, regionId, locale, retry])
  const emptyFilters = { sizes: [], colors: [], price: { min: null, max: null, currency_code: "rsd" } }
  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / 24))
  const count = data?.count ?? 0
  return <section id="catalog-products" className="catalog-layout" aria-busy={loading || pending}>
    <CatalogFilters filters={data?.filters ?? emptyFilters} selection={selection} basePath={basePath} />
    <div className="catalog-toolbar">
    <div className="catalog-heading"><h1>{title}</h1></div>
    <form role="search" className="catalog-search" action={basePath} onSubmit={event => {
      event.preventDefault()
      const q = String(new FormData(event.currentTarget).get("q") ?? "").trim()
      startTransition(() => router.push(catalogHref({ ...selection, q, page: 1 }, basePath), { scroll: false }))
    }}>
      <button type="submit" aria-label={t("catalog.search")}><DesignIcon name="search" /></button>
      <input key={selection.q} type="search" name="q" maxLength={200} defaultValue={selection.q} placeholder={t("catalog.searchPlaceholder")} aria-label={t("catalog.search")} enterKeyHint="search" />
    </form>
    </div>
    <p className="catalog-count text-sm text-[var(--store-text-muted)]" role="status">{loading ? t("common.loading") : t("catalog.count", { n: count })}</p>
    <label className="catalog-sort"><span className="sr-only">{t("design.sort")}</span><select value={selection.sort} onChange={e => startTransition(() => router.push(catalogHref({ ...selection, sort: e.target.value as CatalogSelection["sort"], page: 1 }, basePath), { scroll: false }))}>{catalogSorts.map(sort => <option key={sort} value={sort}>{t(`design.sorts.${sort}`)}</option>)}</select></label>
    <div className="catalog-results">
      {error ? <div role="alert" className="empty-state"><p>{t("design.catalogFailed")}</p><button className="button-secondary mt-4" type="button" onClick={() => setRetry(n => n + 1)}>{t("common.retry")}</button></div> : !data?.products.length ? <div className="empty-state"><p>{t("design.noResults")}</p><Link href="/rs/catalog" className="button-secondary mt-4">{t("design.reset")}</Link></div> : <ul className="product-grid">{data.products.map(product => <ProductCard key={product.id} product={product} summary={summaries ? summaries[product.id] ?? { rating: 0, count: 0 } : null} />)}</ul>}
      {!error && pages > 1 && <nav className="catalog-pagination" aria-label={t("catalog.page", { n: selection.page, total: pages })}>{selection.page > 1 && <Link className="button-secondary" href={catalogHref({ ...selection, page: Math.min(selection.page - 1, pages) }, basePath)}>{t("common.previous")}</Link>}<span>{t("catalog.page", { n: selection.page, total: pages })}</span>{selection.page < pages && <Link className="button-secondary" href={catalogHref({ ...selection, page: selection.page + 1 }, basePath)}>{t("common.next")}</Link>}</nav>}
    </div>
  </section>
}
