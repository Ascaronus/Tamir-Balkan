"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState, Suspense } from "react"
import { useLocaleContext, useTranslations } from "@/components/i18n/LocaleProvider"
import { medusaStoreLocale } from "@/lib/i18n/config"
import { sdk } from "@/lib/medusa"
import type { HttpTypes } from "@medusajs/types"

type Country = "rs" | "me"

/** API может вернуть плоский список или дерево с `category_children`. */
function normalizeCategoriesFromApi(
  roots: HttpTypes.StoreProductCategory[]
): HttpTypes.StoreProductCategory[] {
  const out: HttpTypes.StoreProductCategory[] = []
  const seen = new Set<string>()
  function walk(nodes: HttpTypes.StoreProductCategory[]) {
    for (const n of nodes) {
      if (!seen.has(n.id)) {
        seen.add(n.id)
        out.push({ ...n, category_children: [] })
      }
      if (n.category_children?.length) walk(n.category_children)
    }
  }
  walk(roots)
  return out
}

function flattenCategoryTree(
  categories: HttpTypes.StoreProductCategory[],
  sortLocale: string
): { cat: HttpTypes.StoreProductCategory; depth: number }[] {
  const byParent = new Map<string | null, HttpTypes.StoreProductCategory[]>()
  for (const c of categories) {
    const pid = c.parent_category_id ?? null
    if (!byParent.has(pid)) byParent.set(pid, [])
    byParent.get(pid)!.push(c)
  }
  for (const arr of byParent.values()) {
    arr.sort(
      (a, b) =>
        (a.rank ?? 0) - (b.rank ?? 0) ||
        a.name.localeCompare(b.name, sortLocale)
    )
  }

  const out: { cat: HttpTypes.StoreProductCategory; depth: number }[] = []

  function walk(pid: string | null, depth: number) {
    const list = byParent.get(pid) ?? []
    for (const node of list) {
      out.push({ cat: node, depth })
      walk(node.id, depth + 1)
    }
  }

  walk(null, 0)
  return out
}

/** Индекс parent_id → отсортированные дети (для дерева и подменю). */
function buildCategoryChildMap(
  categories: HttpTypes.StoreProductCategory[],
  sortLocale: string
): Map<string | null, HttpTypes.StoreProductCategory[]> {
  const flat = normalizeCategoriesFromApi(categories)
  const byParent = new Map<string | null, HttpTypes.StoreProductCategory[]>()
  for (const c of flat) {
    const pid = c.parent_category_id ?? null
    if (!byParent.has(pid)) byParent.set(pid, [])
    byParent.get(pid)!.push(c)
  }
  for (const arr of byParent.values()) {
    arr.sort(
      (a, b) =>
        (a.rank ?? 0) - (b.rank ?? 0) ||
        a.name.localeCompare(b.name, sortLocale)
    )
  }
  return byParent
}

function categoryNavLinkClass(active: boolean) {
  return `block rounded-md border-l-[3px] px-3 py-2.5 text-sm transition-colors ${
    active
      ? "border-white/40 bg-white/[0.06] text-white"
      : "border-transparent text-white/85 hover:border-white/25 hover:bg-white/[0.06]"
  }`
}

/** Десктоп (md+): подкатегории раскрываются при наведении на родителя (вниз, без вылета вправо — иначе обрезает overflow у nav). */
function DesktopCategoryBranch({
  cat,
  byParent,
  catalogBase,
  onNavigate,
  activeCategoryId,
}: {
  cat: HttpTypes.StoreProductCategory
  byParent: Map<string | null, HttpTypes.StoreProductCategory[]>
  catalogBase: string
  onNavigate?: () => void
  activeCategoryId: string | null
}) {
  const children = byParent.get(cat.id) ?? []
  const href = `${catalogBase}?category_id=${encodeURIComponent(cat.id)}`
  const active = activeCategoryId === cat.id

  if (children.length === 0) {
    return (
      <li>
        <Link
          href={href}
          onClick={onNavigate}
          className={categoryNavLinkClass(active)}
        >
          {cat.name}
        </Link>
      </li>
    )
  }

  return (
    <li className="group/cat relative">
      <Link
        href={href}
        onClick={onNavigate}
        className={`${categoryNavLinkClass(active)} flex items-center justify-between gap-2`}
      >
        <span className="min-w-0 truncate">{cat.name}</span>
        <span className="shrink-0 text-[0.65rem] text-white/45" aria-hidden>
          ▾
        </span>
      </Link>
      <ul className="mt-0.5 hidden space-y-0.5 border-l border-white/12 py-0.5 pl-2.5 ml-2 group-hover/cat:block">
        {children.map((c) => (
          <DesktopCategoryBranch
            key={c.id}
            cat={c}
            byParent={byParent}
            catalogBase={catalogBase}
            onNavigate={onNavigate}
            activeCategoryId={activeCategoryId}
          />
        ))}
      </ul>
    </li>
  )
}

function ShopSidebarInner({
  countryCode,
  onNavigate,
}: {
  countryCode?: Country
  onNavigate?: () => void
}) {
  const { locale } = useLocaleContext()
  const t = useTranslations()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeCategoryId = searchParams.get("category_id")
  const sortLocale = locale === "sr" ? "sr" : "en"

  const [categories, setCategories] = useState<HttpTypes.StoreProductCategory[]>(
    []
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { product_categories } = await sdk.client.fetch<{
          product_categories: HttpTypes.StoreProductCategory[]
        }>(`/store/product-categories`, {
          method: "GET",
          query: {
            limit: 100,
            offset: 0,
            fields: "id,name,handle,parent_category_id,rank,*category_children",
          },
          headers: { "x-medusa-locale": medusaStoreLocale(locale) },
          cache: "no-store",
        })
        if (!cancelled) setCategories(product_categories ?? [])
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : t("sidebar.categoriesError")
          )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [t, locale])

  const flatWithDepth = useMemo(() => {
    const flat = normalizeCategoriesFromApi(categories)
    return flattenCategoryTree(flat, sortLocale)
  }, [categories, sortLocale])

  const childMap = useMemo(
    () => buildCategoryChildMap(categories, sortLocale),
    [categories, sortLocale]
  )
  const rootCategories = childMap.get(null) ?? []

  const catalogBase = countryCode ? `/${countryCode}/catalog` : "/"

  const allProductsActive =
    Boolean(pathname?.includes("/catalog")) && !activeCategoryId

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/10 px-4 py-5">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-white/90">
          {t("sidebar.title")}
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={t("sidebar.title")}>
        {!countryCode ? (
          <p className="px-3 py-2 text-sm leading-relaxed text-white/70">
            {t("sidebar.pickRegionHint")}
          </p>
        ) : (
          <>
            <ul className="space-y-0.5">
              <li>
                <Link
                  href={catalogBase}
                  onClick={onNavigate}
                  className={categoryNavLinkClass(allProductsActive)}
                >
                  {t("sidebar.allProducts")}
                </Link>
              </li>
            </ul>

            {loading ? (
              <p className="px-3 py-3 text-sm text-white/50">
                {t("sidebar.loadingCategories")}
              </p>
            ) : error ? (
              <p className="px-3 py-3 text-sm text-red-300/90">{error}</p>
            ) : flatWithDepth.length === 0 ? (
              <p className="px-3 py-3 text-sm leading-relaxed text-white/55">
                {t("sidebar.noCategoriesHint")}
              </p>
            ) : (
              <>
                <ul className="mt-1 hidden space-y-0.5 md:block">
                  {rootCategories.map((cat) => (
                    <DesktopCategoryBranch
                      key={cat.id}
                      cat={cat}
                      byParent={childMap}
                      catalogBase={catalogBase}
                      onNavigate={onNavigate}
                      activeCategoryId={activeCategoryId}
                    />
                  ))}
                </ul>
                <ul className="mt-1 space-y-0.5 md:hidden">
                  {flatWithDepth.map(({ cat, depth }) => {
                    const href = `${catalogBase}?category_id=${encodeURIComponent(cat.id)}`
                    const active = activeCategoryId === cat.id
                    return (
                      <li key={cat.id}>
                        <Link
                          href={href}
                          onClick={onNavigate}
                          style={{ paddingLeft: `${0.75 + depth * 0.65}rem` }}
                          className={`block rounded-md border-l-[3px] py-2.5 pr-3 text-sm transition-colors ${
                            active
                              ? "border-white/40 bg-white/[0.06] text-white"
                              : "border-transparent text-white/85 hover:border-white/25 hover:bg-white/[0.06]"
                          }`}
                        >
                          {cat.name}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </>
        )}

        <div className="mt-6 border-t border-white/10 px-3 pt-4">
          <p className="text-[0.65rem] uppercase tracking-wider text-white/45">
            {t("sidebar.region")}
          </p>
          <div className="mt-2 flex flex-col gap-1">
            <Link
              href="/rs/catalog"
              onClick={onNavigate}
              className={`text-sm ${countryCode === "rs" ? "text-[var(--store-accent)]" : "text-white/75 hover:text-white"}`}
            >
              {t("sidebar.serbia")}
            </Link>
            <Link
              href="/me/catalog"
              onClick={onNavigate}
              className={`text-sm ${countryCode === "me" ? "text-[var(--store-accent)]" : "text-white/75 hover:text-white"}`}
            >
              {t("sidebar.montenegro")}
            </Link>
          </div>
        </div>
      </nav>
    </div>
  )
}

function ShopSidebarFallback() {
  const t = useTranslations()
  return (
    <div className="flex h-full min-h-0 flex-col px-4 py-5">
      <p className="text-sm text-white/50">{t("sidebar.loadingMenu")}</p>
    </div>
  )
}

export function ShopSidebar({
  countryCode,
  onNavigate,
}: {
  countryCode?: Country
  onNavigate?: () => void
}) {
  return (
    <Suspense fallback={<ShopSidebarFallback />}>
      <ShopSidebarInner countryCode={countryCode} onNavigate={onNavigate} />
    </Suspense>
  )
}
