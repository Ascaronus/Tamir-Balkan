export type FeedOffer = {
  id: string
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
