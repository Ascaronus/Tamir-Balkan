export const catalogSorts = ["newest", "price_asc", "price_desc", "popularity"] as const
export type CatalogInput = {
  region_id: string; country_code?: string; province?: string; category_id?: string; q?: string
  size: string[]; color: string[]; min_price?: number; max_price?: number
  sort: typeof catalogSorts[number]; limit: number; offset: number
}
export class CatalogInputError extends Error {}
const invalid = (key: string): never => { throw new CatalogInputError(`Invalid catalog parameter: ${key}`) }
export const normalizeOption = (value: string) => value.normalize("NFKC").trim().toLowerCase()

export function parseCatalogInput(query: Record<string, unknown>): CatalogInput {
  const allowed = new Set(["region_id", "country_code", "province", "category_id", "q", "size", "color", "min_price", "max_price", "sort", "limit", "offset"])
  for (const key of Object.keys(query)) if (!allowed.has(key)) invalid(key)
  const text = (key: string, max = 100) => {
    const value = query[key]
    if (value === undefined) return undefined
    if (typeof value !== "string" || !value.trim() || value.length > max) return invalid(key)
    return value.trim()
  }
  const list = (key: string) => {
    if (query[key] === undefined) return []
    // Repeated parameters preserve decimal sizes such as "42,5".
    const values = Array.isArray(query[key]) ? query[key] as unknown[] : [query[key]]
    if (values.length > 20) return invalid(key)
    return [...new Set(values.map(value => {
      if (typeof value !== "string" || !value.trim() || value.length > 80) return invalid(key)
      return normalizeOption(value)
    }))]
  }
  const decimal = (key: string) => {
    const value = text(key, 30)
    if (value === undefined) return undefined
    if (!/^\d+(?:[.,]\d{1,4})?$/.test(value)) return invalid(key)
    const result = Number(value.replace(",", "."))
    if (!Number.isFinite(result) || result > 1_000_000_000) return invalid(key)
    return result
  }
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = text(key, 10)
    if (value === undefined) return fallback
    if (!/^\d+$/.test(value)) return invalid(key)
    const result = Number(value)
    if (result < min || result > max) return invalid(key)
    return result
  }
  const region_id = text("region_id") || invalid("region_id")
  const country_code = text("country_code", 2)?.toLowerCase()
  if (country_code && !/^[a-z]{2}$/.test(country_code)) invalid("country_code")
  const province = text("province")
  if (province && !country_code) invalid("province requires country_code")
  const sort = text("sort") ?? "newest"
  if (!(catalogSorts as readonly string[]).includes(sort)) invalid("sort")
  const min_price = decimal("min_price"), max_price = decimal("max_price")
  if (min_price !== undefined && max_price !== undefined && min_price > max_price) invalid("min_price > max_price")
  return { region_id, country_code, province, category_id: text("category_id"), q: text("q", 200),
    size: list("size"), color: list("color"), min_price, max_price,
    sort: sort as CatalogInput["sort"], limit: integer("limit", 24, 1, 100), offset: integer("offset", 0, 0, 10000) }
}

type Option = { id?: string; option_id?: string; value: string; option?: { title?: string } }
export type CatalogVariant = { id: string; options?: Option[]; calculated_price?: {
  calculated_amount?: number | null; calculated_amount_with_tax?: number | null; currency_code?: string
} | null }
export type CatalogProduct = { id: string; created_at?: string | Date; options?: { id: string; title: string }[]; variants?: CatalogVariant[] }
const aliases = {
  size: new Set(["size", "sizes", "размер", "розмір", "veličina", "velicina", "величина"]),
  color: new Set(["color", "colour", "цвет", "колір", "boja", "боја"]),
}
function variantOptions(product: CatalogProduct, variant: CatalogVariant, kind: "size" | "color") {
  return (variant.options ?? []).filter(value => {
    const title = product.options?.find(option => option.id === value.option_id)?.title ?? value.option?.title ?? ""
    return aliases[kind].has(normalizeOption(title))
  }).map(value => ({ value: normalizeOption(value.value), label: value.value.trim() }))
}
export function variantPrice(variant: CatalogVariant, currency: string): number | null {
  const price = variant.calculated_price
  if (!price || price.currency_code?.toLowerCase() !== currency.toLowerCase()) return null
  const amount = price.calculated_amount_with_tax ?? price.calculated_amount
  return typeof amount === "number" && Number.isFinite(amount) && amount >= 0 ? amount : null
}

// Evaluate complete candidates before pagination. Each conjunction must match
// one variant: a red M and a blue L do not form a red L.
export function selectCatalog(products: CatalogProduct[], input: CatalogInput, currency: string, popularity: Map<string, number> = new Map()) {
  const sizes = new Map<string, { label: string; ids: Set<string> }>()
  const colors = new Map<string, { label: string; ids: Set<string> }>()
  let min: number | null = null, max: number | null = null
  const rows: { id: string; created_at: number; price: number | null; matching_variant_ids: string[]; preferred_variant_id: string | null }[] = []
  const add = (map: typeof sizes, options: { value: string; label: string }[], id: string) => {
    for (const option of options) {
      if (!map.has(option.value)) map.set(option.value, { label: option.label, ids: new Set() })
      map.get(option.value)!.ids.add(id)
    }
  }
  for (const product of products) {
    const matching: { id: string; price: number | null }[] = []
    for (const variant of product.variants ?? []) {
      const size = variantOptions(product, variant, "size"), color = variantOptions(product, variant, "color")
      const matchesSize = !input.size.length || size.some(o => input.size.includes(o.value))
      const matchesColor = !input.color.length || color.some(o => input.color.includes(o.value))
      const price = variantPrice(variant, currency)
      const matchesPrice = (input.min_price === undefined && input.max_price === undefined) ||
        (price !== null && (input.min_price === undefined || price >= input.min_price) &&
          (input.max_price === undefined || price <= input.max_price))
      if (matchesColor && matchesPrice) add(sizes, size, product.id)
      if (matchesSize && matchesPrice) add(colors, color, product.id)
      if (matchesSize && matchesColor && price !== null) { min = Math.min(min ?? price, price); max = Math.max(max ?? price, price) }
      if (matchesSize && matchesColor && matchesPrice) matching.push({ id: variant.id, price })
    }
    if (!matching.length) continue
    matching.sort((a, b) => comparePrice(a.price, b.price, false) || compareId(a.id, b.id))
    rows.push({ id: product.id, created_at: new Date(product.created_at ?? 0).getTime() || 0,
      price: matching[0].price, matching_variant_ids: matching.map(v => v.id), preferred_variant_id: matching[0].id })
  }
  rows.sort((a, b) => {
    const primary = input.sort === "price_asc" || input.sort === "price_desc"
      ? comparePrice(a.price, b.price, input.sort === "price_desc")
      : input.sort === "popularity" ? (popularity.get(b.id) ?? 0) - (popularity.get(a.id) ?? 0) : 0
    return primary || b.created_at - a.created_at || compareId(a.id, b.id)
  })
  const facets = (map: typeof sizes) => [...map].map(([value, item]) => ({ value, label: item.label, count: item.ids.size }))
    .sort((a, b) => a.value.localeCompare(b.value, "en", { numeric: true }))
  return { rows: rows.slice(input.offset, input.offset + input.limit), count: rows.length,
    filters: { sizes: facets(sizes), colors: facets(colors), price: { min, max, currency_code: currency } } }
}
function compareId(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0 }
function comparePrice(a: number | null, b: number | null, descending: boolean) {
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  return descending ? b - a : a - b
}
