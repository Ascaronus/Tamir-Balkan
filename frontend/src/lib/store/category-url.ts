import type { CatalogQuery } from "./search-params"

/** Handles belong to categories in Medusa, so newly created categories need no route configuration. */
export function categoryPath(category: { id: string; handle?: string | null }): string {
  return category.handle
    ? `/rs/catalog/${encodeURIComponent(category.handle)}`
    : `/rs/catalog?category_id=${encodeURIComponent(category.id)}`
}

/** Keep filters, pagination and repeated values when an old category link redirects. */
export function categoryRedirectPath(category: { id: string; handle?: string | null }, query: CatalogQuery): string {
  const url = new URL(categoryPath(category), "https://catalog.invalid")
  for (const [key, value] of Object.entries(query)) {
    if (key === "category_id" || value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, item)
  }
  return url.pathname + url.search
}
