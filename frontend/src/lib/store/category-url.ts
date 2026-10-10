import type { CatalogQuery } from "./search-params"
import type { Locale } from "../i18n/config"

type Category = { id: string; handle?: string | null; metadata?: Record<string, unknown> | null }
export function categoryHandle(category: Category, locale: Locale = "sr"): string | undefined {
  const handles = category.metadata?.category_handles as Partial<Record<Locale, string>> | undefined
  return handles?.[locale] || category.handle || undefined
}

/** Handles belong to categories in Medusa, so newly created categories need no route configuration. */
export function categoryPath(category: Category, locale: Locale = "sr"): string {
  const handle = categoryHandle(category, locale)
  const prefix = locale === "en" ? "en" : "rs"
  return handle
    ? `/${prefix}/catalog/${encodeURIComponent(handle)}`
    : `/${prefix}/catalog?category_id=${encodeURIComponent(category.id)}`
}

export function matchesCategoryHandle(category: Category, handle: string): boolean {
  const aliases = category.metadata?.category_handle_aliases
  return [category.handle, categoryHandle(category, "sr"), categoryHandle(category, "en"), ...(Array.isArray(aliases) ? aliases : [])].includes(handle)
}

/** Keep filters, pagination and repeated values when an old category link redirects. */
export function categoryRedirectPath(category: Category, query: CatalogQuery, locale: Locale = "sr"): string {
  const url = new URL(categoryPath(category, locale), "https://catalog.invalid")
  for (const [key, value] of Object.entries(query)) {
    if (key === "category_id" || value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, item)
  }
  return url.pathname + url.search
}
