import type { HttpTypes } from "@medusajs/types"
import { sdk } from "@/lib/medusa"
import { medusaStoreLocale, type Locale } from "@/lib/i18n/config"
import { queryText, type CatalogQuery } from "./search-params"

export const catalogSorts = ["newest", "price_asc", "price_desc", "popularity"] as const
export type CatalogSort = typeof catalogSorts[number]
export type Facet = { value: string; label: string; count: number }
export type CatalogProduct = HttpTypes.StoreProduct & { catalog: { price: number | null; currency_code: string; preferred_variant_id: string | null; matching_variant_ids: string[] } }
export type CatalogResult = { products: CatalogProduct[]; count: number; filters: { sizes: Facet[]; colors: Facet[]; price: { min: number | null; max: number | null; currency_code: string } } }
export type CatalogSelection = { category_id: string; q: string; size: string[]; color: string[]; min_price: string; max_price: string; sort: CatalogSort; page: number }
function list(value: string | string[] | undefined) { return [...new Set((Array.isArray(value) ? value : value ? [value] : []).map(v => v.trim().toLowerCase()).filter(Boolean))].slice(0, 20) }
export function catalogSelection(query: CatalogQuery): CatalogSelection {
  const sort = queryText(query.sort)
  return { category_id: queryText(query.category_id), q: queryText(query.q).slice(0, 200), size: list(query.size), color: list(query.color), min_price: queryText(query.min_price), max_price: queryText(query.max_price), sort: catalogSorts.includes(sort as CatalogSort) ? sort as CatalogSort : "newest", page: Math.max(1, Math.min(417, Number.parseInt(queryText(query.page), 10) || 1)) }
}
export function catalogParams(selection: CatalogSelection) {
  const params = new URLSearchParams()
  for (const key of ["category_id", "q", "min_price", "max_price", "sort"] as const) if (selection[key]) params.set(key, selection[key])
  for (const key of ["size", "color"] as const) selection[key].forEach(v => params.append(key, v))
  if (selection.page > 1) params.set("page", String(selection.page))
  return params
}
export async function fetchCatalog(selection: CatalogSelection, regionId: string, locale: Locale, options?: { token?: string | null; signal?: AbortSignal; limit?: number }): Promise<CatalogResult> {
  const limit = Math.max(1, Math.min(24, Math.floor(options?.limit ?? 24)))
  const query = catalogParams(selection)
  query.delete("page")
  query.set("region_id", regionId); query.set("country_code", "rs"); query.set("limit", String(limit)); query.set("offset", String((selection.page - 1) * limit))
  // Repeated size/color parameters deliberately preserve decimal sizes such as 42,5.
  return sdk.client.fetch<CatalogResult>(`/store/catalog/products?${query}`, { method: "GET", cache: "no-store", signal: options?.signal, headers: { "x-medusa-locale": medusaStoreLocale(locale), ...(options?.token ? { authorization: `Bearer ${options.token}` } : {}) } })
}
export function colorSwatch(value: string): string | undefined {
  const colors: Record<string, string> = { black: "#0a0a0a", crna: "#0a0a0a", черный: "#0a0a0a", white: "#ffffff", bela: "#ffffff", белый: "#ffffff", navy: "#1b2b44", tamnoplava: "#1b2b44", blue: "#335d8a", plava: "#335d8a", gray: "#777777", grey: "#777777", siva: "#777777", beige: "#bba88a", bež: "#bba88a", bez: "#bba88a", brown: "#72513d", braon: "#72513d", green: "#546748", zelena: "#546748", red: "#9c3333", crvena: "#9c3333" }
  const normalized = value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ _-]/g, "")
  const aliases: Record<string, string> = {
    crno: "black", crni: "black", црна: "black", црни: "black", черныи: "black", чорний: "black",
    belo: "white", beli: "white", bijela: "white", бела: "white", бели: "white", белыи: "white",
    darkblue: "navy", navyblue: "navy", teget: "navy", tamnoplavi: "navy", тамноплава: "navy",
    plavo: "blue", plavi: "blue", плава: "blue", синии: "blue",
    greay: "gray", sivo: "gray", sivi: "gray", сива: "gray", серыи: "gray",
    bez: "beige", беж: "beige", bezh: "beige", браон: "brown", braon: "brown",
    zeleno: "green", zeleni: "green", зелена: "green", crveno: "red", crveni: "red", црвена: "red",
    kaki: "khaki", каки: "khaki", хаки: "khaki", хакі: "khaki",
    burgundija: "burgundy", бургундија: "burgundy", бордо: "burgundy",
  }
  const extra: Record<string, string> = { lightgray: "#b8b8b8", svetlosiva: "#b8b8b8", darkgray: "#474747", tamnosiva: "#474747", lightblue: "#9cbed8", svetloplava: "#9cbed8", pink: "#d797af", roze: "#d797af", burgundy: "#6d263c", bordo: "#6d263c", yellow: "#dbc56a", zuta: "#dbc56a", orange: "#d28a47", narandzasta: "#d28a47", purple: "#765578", ljubicasta: "#765578", olive: "#77764e", maslinasta: "#77764e", khaki: "#999577", cream: "#efe7d2", krem: "#efe7d2" }
  if (/^#[0-9a-f]{6}$/i.test(value.trim())) return value.trim()
  const canonical = aliases[normalized] || normalized
  return colors[canonical] || extra[canonical]
}
export function isColorOption(title: string) { return /^(color|colour|boja|боја|цвет|колір)$/i.test(title.trim()) }
