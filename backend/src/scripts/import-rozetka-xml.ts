import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IFileModuleService } from "@medusajs/types/dist/file/service"
import type { CreateFileDTO } from "@medusajs/types/dist/file/mutations"
import {
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { XMLParser } from "fast-xml-parser"
import crypto from "node:crypto"
import type { IInventoryService } from "@medusajs/types/dist/inventory/service"
import type { UpdateInventoryLevelInput } from "@medusajs/types/dist/inventory/mutations/inventory-level"
import type { IProductModuleService } from "@medusajs/types/dist/product/service"

type FxApiPairResponse = {
  base: string
  target: string
  rate: number
  timestamp: string
}

type RozetkaOffer = {
  id: string
  available?: string | boolean
  url: string
  price: string | number
  currencyId?: string
  categoryId?: string
  picture?: string | string[]
  name?: string
  vendor?: string
  stock_quantity?: string | number
  description?: string
  param?:
    | { name: string; "#text"?: string }[]
    | { name: string; "#text"?: string }
}

function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

function toText(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "string") return v
  if (typeof v === "number") return String(v)
  if (typeof v === "boolean") return v ? "true" : "false"
  return ""
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").trim())
  return Number.isFinite(n) ? n : null
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function stripHtml(input: string): string {
  // XML description comes as CDATA with HTML entities/tags; keep text only for metadata fallback.
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "-")
    .replace(/&ndash;/g, "-")
    .replace(/&laquo;|&raquo;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" as any })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return (await res.json()) as T
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" as any })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return await res.text()
}

type GoogleTranslateResponse = {
  data?: {
    translations?: { translatedText?: string; detectedSourceLanguage?: string }[]
  }
  error?: { message?: string }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function splitChunks(text: string, maxLen: number): string[] {
  const t = text.trim()
  if (!t) return [""]
  if (t.length <= maxLen) return [t]
  const parts: string[] = []
  let start = 0
  while (start < t.length) {
    let end = Math.min(t.length, start + maxLen)
    const slice = t.slice(start, end)
    const lastSpace = slice.lastIndexOf(" ")
    if (lastSpace > 200) {
      end = start + lastSpace
    }
    parts.push(t.slice(start, end))
    start = end
  }
  return parts
}

function normalizeLang(target: "en" | "sr"): string {
  return target === "sr" ? "sr-Latn" : "en"
}

async function googleTranslateText(params: {
  apiKey: string
  q: string
  target: "en" | "sr"
}): Promise<string> {
  const { apiKey, q, target } = params
  const chunks = splitChunks(q, 4500)
  const out: string[] = []
  for (const chunk of chunks) {
    if (!chunk.trim()) continue
    const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(
      apiKey
    )}`
    const body = {
      q: chunk,
      target: normalizeLang(target),
      format: "text",
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as GoogleTranslateResponse
    if (!res.ok) {
      throw new Error(
        json?.error?.message || `Google Translate HTTP ${res.status}`
      )
    }
    const translated = json?.data?.translations?.[0]?.translatedText
    out.push(decodeHtmlEntities(String(translated ?? "")))
  }
  return out.join(" ").replace(/\s+/g, " ").trim()
}

async function downloadAsBase64(url: string): Promise<{
  base64: string
  mimeType: string
  filename: string
}> {
  const res = await fetch(url, { cache: "no-store" as any })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const contentType = res.headers.get("content-type") || "application/octet-stream"
  const buf = Buffer.from(await res.arrayBuffer())
  const base64 = buf.toString("base64")
  const u = new URL(url)
  const rawName = u.pathname.split("/").pop() || "image"
  const safe = rawName.replace(/[^\w.\-]+/g, "_")
  return { base64, mimeType: contentType, filename: safe }
}

/**
 * Категории без дублей:
 * - ключ = "каноническая" категория, которую создаём в Medusa
 * - каждому входному categoryId из XML сопоставляем канонический ключ
 * - названия на EN/SR задаём руками (без внешних переводов)
 */
const CATEGORY_CANON = {
  bow_ties: { en: "Bow ties", sr: "Leptir mašne" },
  ties: { en: "Ties", sr: "Kravate" },
  hats: { en: "Hats", sr: "Kape" },
  scarves: { en: "Scarves", sr: "Šalovi" },
  pants: { en: "Pants", sr: "Pantalone" },
  vests: { en: "Vests", sr: "Prsluci" },
  blazers: { en: "Blazers", sr: "Sakoi" },
  shirts: { en: "Shirts", sr: "Košulje" },
  accessory_set: { en: "Accessory sets", sr: "Setovi aksesoara" },
  boys_clothing: { en: "Boys clothing", sr: "Odeća za dečake" },
  other: { en: "Other", sr: "Ostalo" },
} as const

const CATEGORY_ID_TO_CANON_KEY: Record<string, keyof typeof CATEGORY_CANON> = {
  "2": "bow_ties",
  "596": "bow_ties",
  "3": "ties",
  "595": "ties",
  "8": "hats",
  "623": "hats",
  "9": "scarves",
  "624": "scarves",
  "10": "pants",
  "608": "pants",
  "15": "vests",
  "632": "vests",
  "643": "vests",
  "646": "vests",
  "17": "blazers",
  "607": "blazers",
  "18": "shirts",
  "564": "shirts",
  "622": "accessory_set",
  "637": "boys_clothing",
  "638": "boys_clothing",
}

type RozetkaCategory = { id: string; "#text"?: string }

function categoryText(cat: RozetkaCategory): string {
  return toText((cat as any)["#text"]).trim()
}

function getOfferParam(offer: RozetkaOffer, name: string): string | null {
  const params = asArray(offer.param)
  const hit = params.find((p) => String((p as any)?.name ?? "") === name)
  const v = hit ? toText((hit as any)["#text"]) : ""
  return v ? v.trim() : null
}

function productKeyFromOffer(offer: RozetkaOffer): string {
  // In this feed, same `url` repeats across sizes → use it as stable product key.
  return offer.url
}

function handleFromOffer(offer: RozetkaOffer): string {
  try {
    const u = new URL(offer.url)
    const last = u.pathname.split("/").filter(Boolean).pop() || offer.id
    return slugify(last.replace(/\.html?$/i, ""))
  } catch {
    return slugify(offer.id)
  }
}

function baseTitleFromOfferName(name: string): string {
  // Typical pattern: "... 58 TMR_504R" → remove last size token when it's a number/letter size.
  const parts = name.trim().split(/\s+/)
  if (parts.length <= 1) return name.trim()
  const maybeSize = parts[parts.length - 2]
  const sizeLike = /^[0-9]{1,3}$/.test(maybeSize) || /^[a-z]{1,4}$/i.test(maybeSize)
  if (sizeLike) {
    return parts.slice(0, parts.length - 2).join(" ").trim()
  }
  return name.trim()
}

function moneyToMinor(amount: number, currency: "eur" | "rsd"): number {
  if (currency === "eur") return Math.max(0, Math.round(amount * 100))
  // RSD is usually no-decimal
  return Math.max(0, Math.round(amount))
}

async function getRatesFromFxApi() {
  // fxapi.app endpoints described here:
  // - https://fxapi.app/UAH/EUR (docs show /api/{base}/{target}.json)
  // - https://fxapi.app/UAH/RSD
  const eur = await fetchJson<FxApiPairResponse>("https://fxapi.app/api/UAH/EUR.json")
  const rsd = await fetchJson<FxApiPairResponse>("https://fxapi.app/api/UAH/RSD.json")
  if (!eur?.rate || !rsd?.rate) throw new Error("Failed to fetch fxapi rates")
  return { uahToEur: eur.rate, uahToRsd: rsd.rate }
}

async function uploadPictures(
  fileModule: IFileModuleService,
  urls: string[]
): Promise<{ url: string }[]> {
  const out: { url: string }[] = []
  for (const url of urls) {
    try {
      const { base64, mimeType, filename } = await downloadAsBase64(url)
      const hashed = crypto.createHash("sha1").update(url).digest("hex").slice(0, 10)
      const dto: CreateFileDTO = {
        filename: `${hashed}-${filename}`,
        mimeType,
        content: base64,
      }
      const created = await fileModule.createFiles(dto)
      if (created?.url) out.push({ url: created.url })
    } catch {
      // Fallback: keep remote URL if upload fails
      out.push({ url })
    }
  }
  return out
}

export default async function importRozetkaXml({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY || ""
  const translateEnabled = Boolean(googleKey)
  const updateExisting = (process.env.ROZETKA_UPDATE_EXISTING || "true") !== "false"
  const uploadImages = (process.env.ROZETKA_UPLOAD_IMAGES || "true") !== "false"
  logger.info(
    `Import flags: update_existing=${updateExisting ? "true" : "false"}, upload_images=${
      uploadImages ? "true" : "false"
    }`
  )

  const stockLocationId =
    process.env.ROZETKA_STOCK_LOCATION_ID || process.env.STOCK_LOCATION_ID || ""
  if (!stockLocationId) {
    throw new Error(
      "Set ROZETKA_STOCK_LOCATION_ID (or STOCK_LOCATION_ID) to link inventory levels."
    )
  }

  const xmlUrl = process.env.ROZETKA_XML_URL || "https://tamir.ua/rozetka/"
  logger.info(`Fetching Rozetka XML: ${xmlUrl}`)

  const [{ uahToEur, uahToRsd }, xml] = await Promise.all([
    getRatesFromFxApi(),
    fetchText(xmlUrl),
  ])
  logger.info(`Rates: 1 UAH → ${uahToEur} EUR, ${uahToRsd} RSD`)

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    allowBooleanAttributes: true,
    processEntities: true,
  })
  const doc = parser.parse(xml) as any
  const offers = asArray<RozetkaOffer>(doc?.yml_catalog?.shop?.offers?.offer)
  const categoriesXml = asArray<RozetkaCategory>(
    doc?.yml_catalog?.shop?.categories?.category
  )

  if (!offers.length) {
    throw new Error("No offers found in XML")
  }

  // 1) Ensure canonical categories exist
  logger.info("Ensuring canonical categories (no duplicates)...")
  const { result: existingCats } = await createProductCategoriesWorkflow(container).run({
    input: {
      product_categories: [],
    },
  })
  // Note: workflow above with empty create is a no-op but returns empty; we'll list via query instead.
  const { data: currentCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
    filters: {},
  })
  const nameToId = new Map<string, string>(
    (currentCategories ?? []).map((c: any) => [String(c.name), String(c.id)])
  )

  const canonKeyToCategoryId = new Map<keyof typeof CATEGORY_CANON, string>()
  const toCreateCategories = Object.entries(CATEGORY_CANON)
    .map(([key, v]) => ({ key: key as keyof typeof CATEGORY_CANON, v }))
    .filter(({ v }) => !nameToId.has(v.en))
    .map(({ v }) => ({ name: v.en, is_active: true }))

  if (toCreateCategories.length) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: toCreateCategories },
    })
    for (const cat of result as any[]) {
      nameToId.set(String(cat.name), String(cat.id))
    }
  }

  for (const [key, v] of Object.entries(CATEGORY_CANON) as any) {
    const id = nameToId.get(v.en)
    if (id) canonKeyToCategoryId.set(key, id)
  }

  // 1b) Create subcategories from XML under canonical parents (no language duplicates)
  logger.info("Ensuring subcategories from Rozetka XML...")
  const existingSubByKey = new Map<string, string>()
  const { data: allCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "parent_category_id"],
    filters: {},
  })
  for (const c of allCategories ?? []) {
    const parent = (c as any).parent_category_id || ""
    existingSubByKey.set(`${parent}::${String((c as any).name)}`, String((c as any).id))
  }

  const subToCreate: any[] = []
  const xmlIdToSubId = new Map<string, string>()

  for (const c of categoriesXml) {
    const id = String((c as any).id ?? "")
    if (!id) continue
    const raw = categoryText(c)
    if (!raw) continue

    const canon =
      CATEGORY_ID_TO_CANON_KEY[id] ?? ("other" as keyof typeof CATEGORY_CANON)
    const parentId = canonKeyToCategoryId.get(canon)
    if (!parentId) continue

    // Deduplicate RU/UA twins by collapsing to a stable key (use original id)
    const baseName = raw
    const key = `${parentId}::${baseName}`
    const existing = existingSubByKey.get(key)
    if (existing) {
      xmlIdToSubId.set(id, existing)
      continue
    }

    // Optionally translate category name for metadata; actual stored name in Medusa stays EN-ish for now
    let nameEn = baseName
    let nameSr = baseName
    if (translateEnabled) {
      try {
        ;[nameEn, nameSr] = await Promise.all([
          googleTranslateText({ apiKey: googleKey, q: baseName, target: "en" }),
          googleTranslateText({ apiKey: googleKey, q: baseName, target: "sr" }),
        ])
      } catch {
        // ignore
      }
    }

    // Create subcategory with English name to keep admin usable; keep translations in metadata.
    subToCreate.push({
      name: nameEn || baseName,
      is_active: true,
      parent_category_id: parentId,
      metadata: {
        rozetka_category_id: id,
        rozetka_category_name_source: baseName,
        i18n: {
          en: { name: nameEn || baseName },
          sr: { name: nameSr || baseName },
        },
      },
    })
    // We'll fill xmlIdToSubId after creation by matching on name+parent.
  }

  if (subToCreate.length) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: subToCreate },
    })
    for (const cat of result as any[]) {
      const parent = String(cat.parent_category_id || "")
      existingSubByKey.set(`${parent}::${String(cat.name)}`, String(cat.id))
    }
  }

  // Rebuild mapping id->subId by searching metadata (more reliable) or name match fallback.
  if (categoriesXml.length) {
    const { data: catsAfter } = await query.graph({
      entity: "product_category",
      fields: ["id", "name", "parent_category_id", "metadata"],
      filters: {},
    })
    for (const c of catsAfter ?? []) {
      const meta = (c as any).metadata as any
      const xmlId = meta?.rozetka_category_id
      if (typeof xmlId === "string") {
        xmlIdToSubId.set(xmlId, String((c as any).id))
      }
    }
  }

  // 2) Group offers → products
  const byProductKey = new Map<string, RozetkaOffer[]>()
  for (const o of offers) {
    if (!o?.url) continue
    const k = productKeyFromOffer(o)
    const arr = byProductKey.get(k) ?? []
    arr.push(o)
    byProductKey.set(k, arr)
  }

  // file module for images
  const fileModule = container.resolve(Modules.FILE) as IFileModuleService

  logger.info(`Importing products: ${byProductKey.size} groups`)

  const productsInput: any[] = []
  const skuToStock: Record<string, number> = {}
  const translationCache = new Map<string, { titleEn: string; titleSr: string; descEn: string; descSr: string }>()

  for (const [key, group] of byProductKey.entries()) {
    const first = group[0]
    const handle = handleFromOffer(first)
    const name = toText(first.name) || handle
    const title = baseTitleFromOfferName(name)
    const descHtml = toText(first.description)
    const descText = stripHtml(descHtml)
    let titleEn = title
    let titleSr = title
    let descEn = descText
    let descSr = descText

    if (translateEnabled) {
      const cacheKey = `${title}||${descText}`
      const cached = translationCache.get(cacheKey)
      if (cached) {
        titleEn = cached.titleEn
        titleSr = cached.titleSr
        descEn = cached.descEn
        descSr = cached.descSr
      } else {
        try {
          const [tEn, tSr, dEn, dSr] = await Promise.all([
            googleTranslateText({ apiKey: googleKey, q: title, target: "en" }),
            googleTranslateText({ apiKey: googleKey, q: title, target: "sr" }),
            googleTranslateText({ apiKey: googleKey, q: descText, target: "en" }),
            googleTranslateText({ apiKey: googleKey, q: descText, target: "sr" }),
          ])
          titleEn = tEn || title
          titleSr = tSr || title
          descEn = dEn || descText
          descSr = dSr || descText
          translationCache.set(cacheKey, { titleEn, titleSr, descEn, descSr })
        } catch (e: any) {
          logger.warn(
            `Google Translate failed for ${handle}: ${String(e?.message || e)} (fallback to source text)`
          )
        }
      }
    }

    const canonKey = first.categoryId
      ? CATEGORY_ID_TO_CANON_KEY[String(first.categoryId)] ??
        ("other" as keyof typeof CATEGORY_CANON)
      : ("other" as keyof typeof CATEGORY_CANON)
    const parentCategoryId = canonKeyToCategoryId.get(canonKey)
    const subCategoryId = first.categoryId
      ? xmlIdToSubId.get(String(first.categoryId))
      : undefined
    const categoryIds = [subCategoryId, parentCategoryId].filter(
      (v): v is string => Boolean(v)
    )

    const pictures = asArray(first.picture).map(String).filter(Boolean).slice(0, 10)
    const images = pictures.length
      ? uploadImages
        ? await uploadPictures(fileModule, pictures)
        : pictures.map((url) => ({ url }))
      : []

    // options: Size
    const sizeValues = Array.from(
      new Set(
        group
          .map((o) => getOfferParam(o, "Размер"))
          .filter((v): v is string => Boolean(v))
      )
    )

    const variants = group.map((o) => {
      const size = getOfferParam(o, "Размер") || "One size"
      const priceUah = toNumber(o.price) ?? 0
      const priceEur = priceUah * uahToEur
      const priceRsd = priceUah * uahToRsd

      const sku = slugify(String(o.id)).toUpperCase()
      skuToStock[sku] = Math.max(0, Math.round(toNumber(o.stock_quantity) ?? 0))

      return {
        title: `${size}`,
        sku,
        options: {
          Size: size,
        },
        prices: [
          { currency_code: "eur", amount: moneyToMinor(priceEur, "eur") },
          { currency_code: "rsd", amount: moneyToMinor(priceRsd, "rsd") },
        ],
        metadata: {
          rozetka_offer_id: o.id,
          rozetka_url: o.url,
          i18n: {
            en: { title: titleEn, description: descEn },
            sr: { title: titleSr, description: descSr },
          },
        },
      }
    })

    productsInput.push({
      title,
      handle,
      description: descText,
      status: "published",
      images,
      ...(categoryIds.length ? { category_ids: categoryIds } : {}),
      options: [
        {
          title: "Size",
          values: sizeValues.length ? sizeValues : ["One size"],
        },
      ],
      variants,
      metadata: {
        rozetka_product_key: key,
        rozetka_url: first.url,
        rozetka_vendor: first.vendor ? String(first.vendor) : undefined,
        rozetka_category_id: first.categoryId ? String(first.categoryId) : undefined,
        rozetka_category_canon: canonKey ?? undefined,
        i18n: {
          en: { title: titleEn, description: descEn },
          sr: { title: titleSr, description: descSr },
        },
      },
    })
  }

  // 3) Create products (idempotency via handle: if already exists, skip)
  // We do a simple skip-if-exists based on handle to avoid duplicates.
  const handles = productsInput.map((p) => p.handle)
  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: handles },
  })
  const existingHandleToId = new Map<string, string>(
    (existingProducts ?? []).map((p: any) => [String(p.handle), String(p.id)])
  )
  const existingHandles = new Set(existingHandleToId.keys())
  const toCreateProducts = productsInput.filter((p) => !existingHandles.has(p.handle))

  logger.info(`Products to create: ${toCreateProducts.length} (skipped ${productsInput.length - toCreateProducts.length})`)
  if (toCreateProducts.length) {
    await createProductsWorkflow(container).run({
      input: { products: toCreateProducts },
    })
  }

  // 3b) Update existing products: categories/images/description + upsert variants (by SKU)
  if (updateExisting && existingHandles.size) {
    logger.info(`Updating existing products: ${existingHandles.size}`)
    const productModule = container.resolve(Modules.PRODUCT) as IProductModuleService

    for (const p of productsInput) {
      const id = existingHandleToId.get(String(p.handle))
      if (!id) continue

      // Product-level upsert (ensures images/thumbnail are actually overwritten)
      const imgs = Array.isArray(p.images) ? p.images : []
      await productModule.upsertProducts({
        id,
        title: p.title,
        description: p.description,
        category_ids: p.category_ids ?? [],
        images: imgs,
        thumbnail: imgs?.[0]?.url ?? null,
        metadata: p.metadata ?? {},
      } as any)

      // Variant upsert by SKU
      const variants = Array.isArray(p.variants) ? p.variants : []
      if (variants.length) {
        await productModule.upsertProductVariants(
          variants.map((v: any) => ({
            ...v,
            product_id: id,
          })) as any
        )
      }
    }
  }

  // 4) Inventory levels by SKU for the chosen stock location
  logger.info(`Linking inventory levels on location ${stockLocationId}...`)
  const inventoryModule = container.resolve(Modules.INVENTORY) as IInventoryService
  const skus = Object.keys(skuToStock)
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku"],
    filters: { sku: skus },
  })
  const skuToItemId = new Map<string, string>(
    (inventoryItems ?? []).map((it: any) => [String(it.sku), String(it.id)])
  )

  const desired = skus
    .map((sku) => {
      const inventory_item_id = skuToItemId.get(sku)
      if (!inventory_item_id) return null
      return {
        inventory_item_id,
        location_id: stockLocationId,
        stocked_quantity: skuToStock[sku] ?? 0,
      }
    })
    .filter(Boolean) as any[]

  const itemIds = Array.from(
    new Set(desired.map((l: { inventory_item_id: string }) => l.inventory_item_id))
  )
  const { data: existingLevels } = await query.graph({
    entity: "inventory_level",
    fields: ["id", "inventory_item_id", "location_id"],
    filters: { inventory_item_id: itemIds, location_id: stockLocationId },
  })
  const levelKeyToId = new Map<string, string>(
    (existingLevels ?? []).map((l: any) => [
      `${l.inventory_item_id}::${l.location_id}`,
      String(l.id),
    ])
  )

  const toCreateLevels: any[] = []
  const toUpdate: UpdateInventoryLevelInput[] = []
  for (const l of desired as any[]) {
    const k = `${l.inventory_item_id}::${l.location_id}`
    const id = levelKeyToId.get(k)
    if (id) {
      toUpdate.push({ id, ...l })
    } else {
      toCreateLevels.push(l)
    }
  }

  if (toUpdate.length) {
    await inventoryModule.updateInventoryLevels(toUpdate)
  }

  if (toCreateLevels.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: toCreateLevels },
    })
  }

  logger.info("Rozetka import finished.")
}

