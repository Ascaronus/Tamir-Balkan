export type CatalogQuery = { category_id?: string | string[]; page?: string | string[]; q?: string | string[] }
export function queryText(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() || ""
}
export function normalizeCatalogQuery(query: CatalogQuery) {
  return { category_id: queryText(query.category_id), q: queryText(query.q),
    page: String(Math.max(1, Math.min(100000, Number.parseInt(queryText(query.page), 10) || 1))) }
}
