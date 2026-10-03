export const DEFAULT_XML_URL = "https://tamir.ua/ua/rozetka/"
export const MAX_XML_BYTES = 10 * 1024 * 1024
export type ImportSource = { type: "url"; url: string } | { type: "file"; name: string; xml: string }
export type SourceVariant = {
  id: string; sku: string; size: string; color: string; price: number | null;
  currency: string; stock: number; available: boolean; params: { name: string; value: string }[]
}
export type SourceProduct = {
  key: string; fingerprint: string; url: string; handle: string; title: string;
  description: string; vendor: string; category_id: string; category_name: string;
  images: string[]; variants: SourceVariant[]; warnings: string[];
  existing?: { id: string; title: string; status: string; updated_at: string; category_ids: string[] }
}
export type ImportDraft = {
  key: string; fingerprint: string; title: string; description: string;
  title_sr: string; description_sr: string; title_en: string; description_en: string;
  vendor: string; category_id: string; images: string[]; status: "draft" | "published";
  variants: { id: string; selected: boolean; sku: string; size: string; color: string; price: string; stock: string }[];
  weight: string; material: string; origin_country: string;
  mode: "create" | "update"; existing_id?: string; existing_updated_at?: string
}
export type ImportSettings = { stock_location_id: string; sales_channel_id: string; shipping_profile_id?: string; image_mode: "remote" | "copy" }
export type ImportPreview = {
  source: string; fetched_at: string; products: SourceProduct[];
  categories: { id: string; name: string; parent_category_id?: string | null }[];
  source_categories: { id: string; name: string; parent_id: string; count: number }[];
  locations: { id: string; name: string }[]; sales_channels: { id: string; name: string }[];
  shipping_profiles: { id: string; name: string }[];
  default_location_id: string; default_sales_channel_id: string; default_shipping_profile_id: string; translation_available: boolean
}
export type ImportResult = { product_id: string; status: string; action: "created" | "updated" | "replayed"; title: string }

export function numberInput(value: string): number | null {
  if (!value.trim()) return null
  const n = Number(value.trim().replace(/\s/g, "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}
export function initialDraft(p: SourceProduct): ImportDraft {
  return {
    key: p.key, fingerprint: p.fingerprint, title: p.title, description: p.description,
    title_sr: "", description_sr: "", title_en: "", description_en: "", vendor: p.vendor,
    category_id: p.existing?.category_ids[0] ?? "", images: [...p.images], status: "draft",
    mode: "create", existing_id: p.existing?.id, existing_updated_at: p.existing?.updated_at,
    weight: "", material: "", origin_country: "",
    variants: p.variants.map(v => ({ id: v.id, selected: true, sku: v.sku, size: v.size, color: v.color,
      price: v.currency === "RSD" && v.price != null ? String(v.price) : "", stock: "0" })),
  }
}
export function draftErrors(d: ImportDraft): string[] {
  const errors: string[] = []
  if (!d.title.trim()) errors.push("Укажите название товара")
  if (!d.category_id) errors.push("Выберите категорию магазина")
  if (d.existing_id && d.mode !== "update") errors.push("Товар уже существует: разрешите его обновление")
  const variants = d.variants.filter(v => v.selected)
  if (!variants.length) errors.push("Выберите хотя бы один вариант")
  const skus = new Set<string>(), combinations = new Set<string>()
  for (const v of variants) {
    const price = numberInput(v.price), stock = numberInput(v.stock)
    if (price === null || price <= 0 || price > 100000000) errors.push(`${v.size || v.id}: укажите положительную цену в RSD`)
    if (stock === null || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) errors.push(`${v.size || v.id}: остаток должен быть целым числом от 0 до 1 000 000`)
    if (!v.size.trim() || !v.sku.trim()) errors.push("Размер и SKU обязательны")
    if (skus.has(v.sku.trim().toLowerCase())) errors.push("SKU выбранных вариантов должны различаться")
    const combination = `${v.size.trim()}\u0000${v.color.trim()}`
    if (combinations.has(combination)) errors.push("Повторяется сочетание размера и цвета")
    skus.add(v.sku.trim().toLowerCase()); combinations.add(combination)
  }
  if (variants.some(v => v.color.trim()) && variants.some(v => !v.color.trim())) errors.push("Укажите цвет у всех выбранных вариантов или очистите его у всех")
  if (d.weight.trim() && (numberInput(d.weight) === null || numberInput(d.weight)! <= 0)) errors.push("Вес должен быть положительным числом в граммах")
  if (d.status === "published" && !d.images.length) errors.push("Для публикации выберите хотя бы одну фотографию")
  return [...new Set(errors)]
}
