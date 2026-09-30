"use client"

import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/components/auth/AuthProvider"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { ProductCard } from "@/components/store/ProductCard"
import { getAuthToken } from "@/lib/auth/auth-storage"
import { catalogSelection, fetchCatalog, type CatalogProduct } from "@/lib/store/catalog"
import { getRegionByCountry } from "@/lib/store/regions"
import { reviewSummaries } from "@/lib/reviews/server"
import type { Summary } from "@/lib/reviews/client"

// Secondary products load only near the bottom of the page, after authentication
// is known, so they neither delay the main product nor show another user's price.
export function RelatedProducts({ productId }: { productId: string }) {
  const { customer, isReady } = useAuth()
  const { locale, t } = useLocaleContext()
  const target = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [data, setData] = useState<{ key: string; products: CatalogProduct[]; summaries: Record<string, Summary> | null } | null>(null)
  const key = `${productId}:${locale}:${customer?.id ?? "guest"}`
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect() }
    }, { rootMargin: "400px" })
    if (target.current) observer.observe(target.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible || !isReady) return
    const abort = new AbortController()
    async function load() {
      const region = await getRegionByCountry("rs")
      if (!region || abort.signal.aborted) return
      const result = await fetchCatalog(catalogSelection({}), region.id, locale, { token: getAuthToken(), signal: abort.signal, limit: 6 })
      const products = result.products.filter(product => product.id !== productId).slice(0, 5)
      const summaries = await reviewSummaries(products.map(product => product.id))
      if (!abort.signal.aborted) setData({ key, products, summaries })
    }
    void load().catch(() => { /* An optional recommendation must not block buying. */ })
    return () => abort.abort()
  }, [visible, isReady, key, locale, productId])
  const current = isReady && data?.key === key ? data : null
  return <div ref={target}>{Boolean(current?.products.length) && <section className="related-products" aria-labelledby="related-products-title">
    <h2 id="related-products-title">{t("design.relatedProducts")}</h2>
    <ul className="product-grid">{current!.products.map(product => <ProductCard key={product.id} product={product} summary={current!.summaries ? current!.summaries[product.id] ?? { rating: 0, count: 0 } : null} />)}</ul>
  </section>}</div>
}
