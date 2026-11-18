export type FeedOffer = {
  id: string
  url?: string
  available?: string | boolean
  picture?: string | string[]
  stock_quantity?: string | number
  price: string | number
  currencyId?: string
  param?: { name: string; "#text"?: string } | { name: string; "#text"?: string }[]
}
export function numeric(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null
  const number = Number(String(value).trim().replace(/\s/g, "").replace(",", "."))
  return Number.isFinite(number) ? number : null
}
export function offerSize(offer: FeedOffer): string {
  const params = Array.isArray(offer.param) ? offer.param : offer.param ? [offer.param] : []
  const size = params.find(param => ["размер", "розмір", "size", "veličina"].includes(param.name.toLowerCase().trim()))
  return String(size?.["#text"] ?? "").trim() || "One size"
}
export function offerStock(offer: FeedOffer): number {
  if (["false", "0"].includes(String(offer.available).toLowerCase())) return 0
  return Math.max(0, Math.floor(numeric(offer.stock_quantity) ?? 0))
}
/** Sizes that mean "the product has no size dimension", so the SKU must not repeat a size token. */
const ONE_SIZE = /^(one[\s_-]*size|no[\s_-]*size|one|os|edini|edina|univer(?:sal)?(?:[\s_-]*(size|rozmir|razmer))?|bez[\s_-]*(size|razmera|razmeru|rozmiru)|без[\s_-]*(размера|размеру|розміру|розміра)|один[\s_-]*(размер|розмір)|єдин(ий|ий)[\s_-]*(розмір|размер)|ediny[\s_-]*(razmer|rozmir))$/i
export function skuToken(value: unknown): string {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase()
}
/**
 * Article of the product as Rozetka knows it: the last path segment of the feed `<url>` without `.html`
 * (`https://tamir.ua/aksessuary/sharfy/baf-tmr-1black.html` → `BAF-TMR-1BLACK`). Empty when the source
 * has no usable Latin article, in which case the offer id remains the only identifier.
 */
export function articleFromOfferUrl(url: unknown): string {
  const raw = String(url ?? "").trim()
  if (!raw) return ""
  let path = raw
  try { path = new URL(raw).pathname } catch { path = raw.replace(/[?#].*$/, "") }
  const segment = path.split("/").filter(Boolean).pop() || ""
  let stem: string
  try { stem = decodeURIComponent(segment) } catch { stem = segment }
  stem = stem.replace(/\.html?$/i, "").trim()
  // Cyrillic or otherwise non-Latin articles cannot be transliterated safely: two different words could
  // collapse into one SKU, so the offer id stays authoritative for those sources.
  return !stem || /[^\x00-\x7F]/.test(stem) ? "" : skuToken(stem)
}
export function isOneSize(size: unknown): boolean {
  const value = String(size ?? "").trim()
  return !value || ONE_SIZE.test(value)
}
/** Previous SKU formula: the offer id as a token. Kept for tracing and for sources without an article. */
export function legacySkuFromOffer(offer: Pick<FeedOffer, "id">): string {
  return skuToken(offer.id)
}
/**
 * SKU the shop and Rozetka agree on: `АРТИКУЛ-РАЗМЕР`, article from `<url>`, size from the size param.
 * `One Size` products keep the bare article. A source without a usable article keeps the old id-based SKU.
 */
export function rozetkaSku(offer: Pick<FeedOffer, "id" | "url">, size: unknown): string {
  const article = articleFromOfferUrl(offer.url)
  if (!article || isOneSize(size)) return article || legacySkuFromOffer(offer)
  const suffix = skuToken(String(size))
  return suffix ? `${article}-${suffix}` : legacySkuFromOffer(offer)
}
export function offerPictures(offers: FeedOffer[]): string[] {
  return [...new Set(offers.flatMap(offer => Array.isArray(offer.picture) ? offer.picture : offer.picture ? [offer.picture] : []).map(value => value.trim()).filter(Boolean))]
}
export function offerPriceRsd(offer: FeedOffer, rate: number): number {
  const amount = numeric(offer.price)
  if (amount === null || amount <= 0) throw new Error(`Invalid price for offer ${offer.id}`)
  const currency = String(offer.currencyId || "UAH").toUpperCase()
  if (!["RSD", "UAH"].includes(currency)) throw new Error(`Unsupported currency ${currency}`)
  if (currency === "UAH" && (!Number.isFinite(rate) || rate <= 0)) throw new Error("Invalid UAH/RSD rate")
  return Math.round(amount * (currency === "RSD" ? 1 : rate) * 100) / 100
}
