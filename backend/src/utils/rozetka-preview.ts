import crypto from "node:crypto"
import { XMLParser, XMLValidator } from "fast-xml-parser"
import { numeric, offerSize, offerStock } from "./rozetka"
import type { SourceProduct, SourceVariant } from "../shared/rozetka-import"

export const ROZETKA_SOURCE = "https://tamir.ua/rozetka/"
export class ImportError extends Error {
  constructor(public status: number, message: string, public product_id?: string) { super(message) }
}
export const digest = (value: string) => crypto.createHash("sha256").update(value).digest("hex")
const array = <T>(v: T | T[] | undefined): T[] => v == null ? [] : Array.isArray(v) ? v : [v]
const text = (v: unknown) => ["string", "number", "boolean"].includes(typeof v) ? String(v).trim() : ""
export function plainText(value: unknown): string {
  return text(value).replace(/<br\s*\/?\s*>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]*>/g, "")
    .replace(/&(?:nbsp|amp|quot|lt|gt|mdash|ndash|laquo|raquo|#39);/g, s => ({ "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&mdash;": "—", "&ndash;": "–", "&laquo;": "«", "&raquo;": "»", "&#39;": "'" }[s] || s))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n/g, "\n\n").trim()
}
export function sourceUrl(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new ImportError(400, "Некорректная ссылка в источнике") }
  if (url.protocol !== "https:" || !["tamir.ua", "www.tamir.ua"].includes(url.hostname) || url.port || url.username || url.password) {
    throw new ImportError(400, "Для этого импорта разрешены только HTTPS-ссылки tamir.ua")
  }
  return url.href
}
export async function fetchSource(url: string, maxBytes: number): Promise<{ body: Buffer; mime: string }> {
  let current = sourceUrl(url)
  const signal = AbortSignal.timeout(25000)
  for (let redirects = 0; redirects <= 3; redirects++) {
    const res = await fetch(current, { redirect: "manual", cache: "no-store", signal })
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location"); await res.body?.cancel()
      if (!location) throw new ImportError(502, "Источник вернул перенаправление без адреса")
      current = sourceUrl(new URL(location, current).href); continue
    }
    if (!res.ok) { await res.body?.cancel(); throw new ImportError(502, `Источник tamir.ua недоступен: HTTP ${res.status}`) }
    if (Number(res.headers.get("content-length")) > maxBytes) { await res.body?.cancel(); throw new ImportError(413, "Файл источника превышает допустимый размер") }
    const chunks: Uint8Array[] = []; let size = 0
    if (!res.body) throw new ImportError(502, "Источник вернул пустой ответ")
    const reader = res.body.getReader()
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break
        size += next.value.byteLength
        if (size > maxBytes) { await reader.cancel(); throw new ImportError(413, "Файл источника превышает допустимый размер") }
        chunks.push(next.value)
      }
    } finally { reader.releaseLock() }
    return { body: Buffer.concat(chunks), mime: (res.headers.get("content-type") || "").split(";")[0] }
  }
  throw new ImportError(502, "Слишком много перенаправлений у источника")
}
export type FeedSnapshot = { fetched_at: string; products: SourceProduct[]; source_categories: { id: string; name: string; parent_id: string; count: number }[] }
export function parseFeed(xml: string): FeedSnapshot {
  // The Rozetka export includes this standard declaration. Never load its DTD.
  xml = xml.replace(/<!DOCTYPE\s+yml_catalog\s+SYSTEM\s+["']shops\.dtd["']\s*>/i, "")
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new ImportError(422, "Источник вернул некорректный XML")
  const shop = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseTagValue: false, parseAttributeValue: false, processEntities: true }).parse(xml)?.yml_catalog?.shop
  const offers = array<any>(shop?.offers?.offer)
  if (!offers.length || offers.length > 10000) throw new ImportError(422, "XML должен содержать от 1 до 10 000 предложений")
  const categories = array<any>(shop?.categories?.category).map(c => ({ id: text(c.id), name: plainText(c["#text"]), parent_id: text(c.parentId), count: 0 }))
  const groups = new Map<string, SourceProduct>(), ids = new Set<string>()
  for (const offer of offers) {
    const id = text(offer.id)
    if (!id || ids.has(id)) throw new ImportError(422, `Отсутствует или повторяется ID предложения: ${id}`)
    ids.add(id)
    const url = new URL(sourceUrl(text(offer.url))); url.search = ""; url.hash = ""; url.hostname = "tamir.ua"
    const productUrl = url.href.replace(/\/$/, ""), key = digest(productUrl)
    let product = groups.get(key)
    if (!product) {
      const category_id = text(offer.categoryId)
      product = { key, fingerprint: "", url: productUrl, handle: `rozetka-${key.slice(0, 20)}`,
        title: plainText(offer.name), description: plainText(offer.description), vendor: text(offer.vendor),
        category_id, category_name: categories.find(c => c.id === category_id)?.name || "Без категории",
        images: [], variants: [], warnings: [] }
      groups.set(key, product)
    }
    const params = array<any>(offer.param).map(p => ({ name: text(p.name), value: plainText(p["#text"]) }))
    const colorRaw = params.find(p => /^(цвет|колір|color|colour|boja)$/i.test(p.name))?.value || ""
    const color = /^(цвет|колір|color|colour|boja)$/i.test(colorRaw) ? "" : colorRaw
    if (colorRaw && !color) product.warnings.push("В источнике вместо цвета указано слово «цвет». Заполните цвет вручную, если нужен.")
    const variant: SourceVariant = { id, sku: id.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toUpperCase(),
      size: offerSize(offer), color, price: numeric(offer.price), currency: text(offer.currencyId).toUpperCase() || "UAH",
      stock: offerStock(offer), available: !["false", "0"].includes(String(offer.available).toLowerCase()), params }
    if (!variant.available) product.warnings.push("В источнике есть недоступные варианты")
    if (variant.price === null || variant.price <= 0) product.warnings.push("В источнике есть вариант без корректной цены")
    if (!["UAH", "RSD"].includes(variant.currency)) product.warnings.push(`Валюта ${variant.currency}: укажите цену в RSD вручную`)
    if (product.variants.some(v => v.size === variant.size && v.color === variant.color)) product.warnings.push("Повторяются размеры/цвета: отредактируйте варианты перед импортом")
    product.variants.push(variant)
    for (const image of array<any>(offer.picture)) {
      try { const safe = sourceUrl(text(image)); if (!product.images.includes(safe)) product.images.push(safe) }
      catch { product.warnings.push("Пропущена фотография с некорректной или внешней ссылкой") }
    }
  }
  for (const product of groups.values()) {
    // Remove only a size token actually present in the feed, preserving the model/article.
    const size = product.variants[0].size.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    product.title = product.title.replace(new RegExp(`\\s${size}(?=\\s+\\S+$|$)`, "i"), "")
    product.images = product.images.slice(0, 30); product.warnings = [...new Set(product.warnings)]
    if (!product.images.length) product.warnings.push("Нет фотографий")
    if (product.variants.length > 100) throw new ImportError(422, `Слишком много вариантов у ${product.title}`)
    product.fingerprint = digest(JSON.stringify(product))
    const category = categories.find(c => c.id === product.category_id); if (category) category.count++
  }
  return { fetched_at: new Date().toISOString(), products: [...groups.values()], source_categories: categories }
}
let snapshot: FeedSnapshot | undefined, expires = 0, pending: Promise<FeedSnapshot> | undefined
export async function loadFeed(refresh = false): Promise<FeedSnapshot> {
  if (!refresh && snapshot && Date.now() < expires) return snapshot
  if (pending) return pending
  pending = (async () => {
    const { body } = await fetchSource(ROZETKA_SOURCE, 20 * 1024 * 1024)
    const result = parseFeed(body.toString("utf8")); snapshot = result; expires = Date.now() + 60000; return result
  })()
  try { return await pending } finally { pending = undefined }
}
