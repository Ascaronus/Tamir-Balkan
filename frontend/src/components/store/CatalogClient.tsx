"use client"
import { useEffect, useRef, useState, useTransition } from "react"
import Link from "@/components/i18n/LocalizedLink"
import { useLocalizedRouter as useRouter } from "@/components/i18n/useLocalizedRouter"
import { useAuth } from "@/components/auth/AuthProvider"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
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
      return fetchCatalog(selection, regionId, locale, { signal: abort.signal })
    }).then(async next => {
      if (!next || abort.signal.aborted) return
      const ratings = await reviewSummaries(next.products.map(p => p.id))
      if (!abort.signal.aborted) { setData(next); setSummaries(ratings) }
    }).catch(() => { if (!abort.signal.aborted) setError(true) }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [customer, isReady, initial, selection, regionId, locale, retry])
  const context = JSON.stringify([selection, regionId, locale, customer?.id ?? "guest"])
  const [extra, setExtra] = useState<{ context: string; products: CatalogResult["products"]; summaries: Record<string, Summary> | null; page: number } | null>(null)
  const [moreErrorContext, setMoreErrorContext] = useState<string | null>(null)
  const moreError = moreErrorContext === context
  const [loadingContext, setLoadingContext] = useState<string | null>(null)
  const loadingMore = loadingContext === context
  const moreRequest = useRef<AbortController | null>(null)
  useEffect(() => () => { moreRequest.current?.abort(); moreRequest.current = null }, [context])
  const appended = extra?.context === context ? extra : null
  const loadedPage = appended?.page ?? selection.page
  const products = [...(data?.products ?? []), ...(appended?.products ?? [])]
  const allSummaries = summaries || appended?.summaries ? { ...summaries, ...appended?.summaries } : null
  async function loadMore() {
    if (moreRequest.current || loading || pending || !isReady) return
    const abort = new AbortController()
    moreRequest.current = abort
    setLoadingContext(context); setMoreErrorContext(null)
    try {
      const next = await fetchCatalog({ ...selection, page: loadedPage + 1 }, regionId, locale, { signal: abort.signal })
      const ratings = await reviewSummaries(next.products.map(p => p.id))
      if (abort.signal.aborted) return
      const known = new Set(products.map(p => p.id))
      setExtra({ context, products: [...(appended?.products ?? []), ...next.products.filter(p => !known.has(p.id))], summaries: { ...appended?.summaries, ...ratings }, page: loadedPage + 1 })
    } catch { if (!abort.signal.aborted) setMoreErrorContext(context) }
    finally { if (moreRequest.current === abort) { moreRequest.current = null; setLoadingContext(null) } }
  }
  const emptyFilters = { sizes: [], colors: [], price: { min: null, max: null, currency_code: "rsd" } }
  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / 24))
  const count = data?.count ?? 0
  return <section id="catalog-products" className="catalog-layout" aria-busy={loading || pending || loadingMore}>
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
    <p className="catalog-count text-sm text-[var(--store-text-muted)]" role="status"><span className="catalog-count-label">{loading ? t("common.loading") : t("catalog.count", { n: count })}</span><span className="catalog-count-number" aria-label={t("catalog.count", { n: count })}>{loading ? "…" : count}</span></p>
    <label className="catalog-sort">
      <span className="sr-only">{t("design.sort")}</span>
      <span className="catalog-sort-display" aria-hidden="true">
        <span>{t(`design.sorts.${selection.sort}`)}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/design/down.svg" width={20} height={20} alt="" />
      </span>
      <select value={selection.sort} onChange={e => startTransition(() => router.push(catalogHref({ ...selection, sort: e.target.value as CatalogSelection["sort"], page: 1 }, basePath), { scroll: false }))}>{catalogSorts.map(sort => <option key={sort} value={sort}>{t(`design.sorts.${sort}`)}</option>)}</select>
    </label>
    <div className="catalog-results">
      {error ? <div role="alert" className="empty-state"><p>{t("design.catalogFailed")}</p><button className="button-secondary mt-4" type="button" onClick={() => setRetry(n => n + 1)}>{t("common.retry")}</button></div> : !data?.products.length ? <div className="empty-state"><p>{t("design.noResults")}</p><Link href="/rs" className="button-secondary mt-4">{t("design.reset")}</Link></div> : <ul className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} summary={allSummaries ? allSummaries[product.id] ?? { rating: 0, count: 0 } : null} />)}</ul>}
      {!error && pages > 1 && <>
        <nav className="catalog-pagination" aria-label={t("catalog.page", { n: selection.page, total: pages })}>
          {selection.page > 1 && <Link className="button-secondary" href={catalogHref({ ...selection, page: selection.page - 1 }, basePath)}>{t("common.previous")}</Link>}
          {Array.from({ length: pages }, (_, i) => i + 1).filter(page => page === 1 || page === pages || Math.abs(page - selection.page) <= 1).map((page, index, visible) => <span key={page} className="inline-flex items-center gap-4">{index > 0 && page - visible[index - 1] > 1 && <span aria-hidden="true">…</span>}<Link className="button-secondary catalog-page-number" aria-current={page === selection.page ? "page" : undefined} aria-label={t("catalog.page", { n: page, total: pages })} href={catalogHref({ ...selection, page }, basePath)}>{page}</Link></span>)}
          {selection.page < pages && <Link className="button-secondary" href={catalogHref({ ...selection, page: selection.page + 1 }, basePath)}>{t("common.next")}</Link>}
        </nav>
        {moreError && <p role="alert" className="mt-4 text-sm text-red-700">{t("design.catalogFailed")}</p>}
        {loadedPage < pages && <button type="button" className="button-secondary catalog-load-more" disabled={loadingMore || loading || pending || !isReady} onClick={() => void loadMore()}>{t(loadingMore ? "common.loading" : moreError ? "common.retry" : "catalog.loadMore")}</button>}
      </>}

    </div>
  </section>
}
