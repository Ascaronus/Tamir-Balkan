"use client"
import { createContext, useContext, useEffect, useState } from "react"
import Link from "next/link"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { listStoreProductCategories } from "@/lib/store/categories"
import { categoryPath } from "@/lib/store/category-url"
import type { HttpTypes } from "@medusajs/types"

const Categories = createContext<{ categories: HttpTypes.StoreProductCategory[]; failed: boolean; activeCategoryId?: string }>({ categories: [], failed: false })
function uniqueCategories(categories: HttpTypes.StoreProductCategory[]) {
  const unique = new Map<string, HttpTypes.StoreProductCategory>()
  function walk(items: HttpTypes.StoreProductCategory[]) { for (const item of items) { if (unique.has(item.id)) continue; unique.set(item.id, item); walk(item.category_children ?? []) } }
  walk(categories)
  return [...unique.values()].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
}
export function CategoryProvider({ children, initialCategories, activeCategoryId }: { children: React.ReactNode; initialCategories?: HttpTypes.StoreProductCategory[]; activeCategoryId?: string }) {
  const { locale } = useLocaleContext()
  const [value, setValue] = useState<{ categories: HttpTypes.StoreProductCategory[]; failed: boolean }>(() => ({ categories: uniqueCategories(initialCategories ?? []), failed: false }))
  useEffect(() => {
    let active = true
    listStoreProductCategories(locale).then(categories => {
      if (active) setValue({ categories: uniqueCategories(categories), failed: false })
    }).catch(() => { if (active) setValue({ categories: [], failed: true }) })
    return () => { active = false }
  }, [locale])
  return <Categories.Provider value={{ ...value, activeCategoryId }}>{children}</Categories.Provider>
}
export function CategoryNavigation({ activeId, horizontal = false, onNavigate }: { activeId?: string; horizontal?: boolean; onNavigate?: () => void }) {
  const { categories, failed, activeCategoryId } = useContext(Categories)
  const selectedId = activeId ?? activeCategoryId
  const { t } = useLocaleContext()
  return <nav aria-label={t("sidebar.title")} className={horizontal ? "category-nav-horizontal" : "category-nav"}>
    <Link href="/rs/catalog" aria-current={!selectedId ? "page" : undefined} onClick={onNavigate}>{t("sidebar.allProducts")}</Link>
    {categories.filter(cat => !horizontal || !cat.parent_category_id).map(cat => <Link key={cat.id} href={categoryPath(cat)} onClick={onNavigate} aria-current={cat.id === selectedId ? "page" : undefined} className={!horizontal && cat.parent_category_id ? "pl-3" : undefined}>{cat.name}</Link>)}
    {failed && !horizontal && <p role="status" className="text-xs text-[var(--store-text-muted)]">{t("sidebar.categoriesError")}</p>}
  </nav>
}
