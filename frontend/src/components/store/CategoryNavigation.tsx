"use client"
import { createContext, useContext, useEffect, useState } from "react"
import Link from "next/link"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { listStoreProductCategories } from "@/lib/store/categories"
import type { HttpTypes } from "@medusajs/types"

const Categories = createContext<{ categories: HttpTypes.StoreProductCategory[]; failed: boolean }>({ categories: [], failed: false })
export function CategoryProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useLocaleContext()
  const [value, setValue] = useState<{ categories: HttpTypes.StoreProductCategory[]; failed: boolean }>({ categories: [], failed: false })
  useEffect(() => {
    let active = true
    listStoreProductCategories(locale).then(categories => {
      const unique = new Map<string, HttpTypes.StoreProductCategory>()
      function walk(items: HttpTypes.StoreProductCategory[]) { for (const item of items) { if (unique.has(item.id)) continue; unique.set(item.id, item); walk(item.category_children ?? []) } }
      walk(categories)
      if (active) setValue({ categories: [...unique.values()].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)), failed: false })
    }).catch(() => { if (active) setValue({ categories: [], failed: true }) })
    return () => { active = false }
  }, [locale])
  return <Categories.Provider value={value}>{children}</Categories.Provider>
}
export function CategoryNavigation({ activeId, horizontal = false, onNavigate }: { activeId?: string; horizontal?: boolean; onNavigate?: () => void }) {
  const { categories, failed } = useContext(Categories)
  const { t } = useLocaleContext()
  return <nav aria-label={t("sidebar.title")} className={horizontal ? "category-nav-horizontal" : "category-nav"}>
    <Link href="/rs/catalog" aria-current={!activeId ? "page" : undefined} onClick={onNavigate}>{t("sidebar.allProducts")}</Link>
    {categories.filter(cat => !horizontal || !cat.parent_category_id).map(cat => <Link key={cat.id} href={`/rs/catalog?category_id=${encodeURIComponent(cat.id)}`} onClick={onNavigate} aria-current={cat.id === activeId ? "page" : undefined} className={!horizontal && cat.parent_category_id ? "pl-3" : undefined}>{cat.name}</Link>)}
    {failed && !horizontal && <p role="status" className="text-xs text-[var(--store-text-muted)]">{t("sidebar.categoriesError")}</p>}
  </nav>
}
