import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow, updateProductsWorkflow, createProductVariantsWorkflow, updateProductVariantsWorkflow,
  createInventoryLevelsWorkflow, linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"
import { statfs } from "node:fs/promises"
import { draftErrors, numberInput, type ImportDraft, type ImportPreview, type ImportResult, type SourceProduct, type ImportSource } from "../shared/rozetka-import"
import { digest, fetchSource, ImportError, loadFeed, ROZETKA_SOURCE, sourceSchema, sourceLabel } from "./rozetka-preview"

import { rozetkaProductText, rozetkaProductHandle } from "./rozetka-product-text"

import { fillProductOptionTranslations } from "./option-auto-translate"

const short = z.string().trim().max(255), description = z.string().max(20000)
export const importRequestSchema = z.object({
  source: sourceSchema.optional(),
  draft: z.object({ key: z.string().regex(/^[a-f0-9]{64}$/), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    title: short.min(1), description, title_sr: short, title_en: short, description_sr: description, description_en: description,
    vendor: short, category_id: short.min(1), images: z.array(z.string().url().max(2048)).max(30), status: z.enum(["draft", "published"]),
    variants: z.array(z.object({ id: short.min(1), selected: z.boolean(), sku: short.min(1), size: short.min(1), color: short,
      price: z.string().max(30), stock: z.string().max(30) }).strict()).min(1).max(100),
    weight: z.string().max(20), material: short, origin_country: z.string().trim().max(2),
    mode: z.enum(["create", "update"]), existing_id: short.optional(), existing_updated_at: z.string().max(64).optional(),
  }).strict(),
  settings: z.object({ stock_location_id: short.min(1), sales_channel_id: short.min(1), shipping_profile_id: short.min(1).optional(), image_mode: z.enum(["remote", "copy"]) }).strict(),
}).strict()
export function validateImport(body: unknown, source: SourceProduct) {
  const parsed = importRequestSchema.safeParse(body)
  if (!parsed.success) throw new ImportError(400, "Проверьте поля импорта: " + parsed.error.issues.slice(0, 3).map(i => i.path.join(".") + " " + i.message).join("; "))
  const { draft } = parsed.data
  const errors = draftErrors(draft)
  if (errors.length) throw new ImportError(400, errors.join(". "))
  if (draft.key !== source.key || draft.fingerprint !== source.fingerprint) throw new ImportError(409, "Товар в XML изменился. Обновите предпросмотр и проверьте изменения перед импортом.")
  if (new Set(draft.images).size !== draft.images.length || draft.images.some(url => !source.images.includes(url))) throw new ImportError(400, "Выберите фотографии из текущего предпросмотра")
  const ids = new Set(source.variants.map(v => v.id))
  if (new Set(draft.variants.map(v => v.id)).size !== draft.variants.length || draft.variants.some(v => !ids.has(v.id))) throw new ImportError(400, "Неизвестный или повторяющийся вариант источника")
  if (draft.origin_country && !/^[a-z]{2}$/i.test(draft.origin_country)) throw new ImportError(400, "Страна производства: двухбуквенный код, например UA или RS")
  return parsed.data
}

export async function importedProducts(container: MedusaContainer): Promise<any[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY), all: any[] = []
  for (let skip = 0; ; skip += 200) {
    const { data } = await query.graph({ entity: "product", fields: ["id", "handle", "title", "description", "status", "updated_at", "metadata", "categories.id"], pagination: { skip, take: 200 } })
    all.push(...data)
    if (data.length < 200) return all
    if (all.length >= 20000) throw new ImportError(422, "Каталог слишком большой для этого инструмента")
  }
}
export function findImported(products: any[], source: SourceProduct) {
  const matches = products.filter(p => p.metadata?.rozetka_product_key === source.url || p.metadata?.rozetka_admin_key === source.key)
  if (matches.length > 1) throw new ImportError(409, `Найдено несколько товаров для ${source.title}. Устраните дубли в разделе товаров.`)
  const product = matches[0]
  if (!product && products.some(p => p.handle === source.handle)) throw new ImportError(409, "Адрес товара занят другим товаром. Проверьте дубли в админке.")
  return product
}
async function listAll(service: any, method: string, filters = {}, select?: string[]): Promise<any[]> {
  const all: any[] = []
  for (let skip = 0; ; skip += 200) {
    const page = await service[method](filters, { skip, take: 200, ...(select ? { select } : {}) }); all.push(...page)
    if (page.length < 200) return all
    if (all.length >= 10000) throw new ImportError(422, "Слишком много записей в настройках магазина")
  }
}
export function chooseShippingProfile(profiles: { id: string; type: string }[], selectedId?: string) {
  if (selectedId) return profiles.find(p => p.id === selectedId)
  return profiles.find(p => p.type === "default") ?? (profiles.length === 1 ? profiles[0] : undefined)
}
export async function previewImport(container: MedusaContainer, refresh = false, source: ImportSource = { type: "url", url: ROZETKA_SOURCE }): Promise<ImportPreview> {
  const [feed, products, categories, locations, channels, stores, profiles] = await Promise.all([
    loadFeed(refresh, source), importedProducts(container),
    listAll(container.resolve(Modules.PRODUCT), "listProductCategories", { is_active: true, is_internal: false }, ["id", "name", "parent_category_id"]),
    listAll(container.resolve(Modules.STOCK_LOCATION), "listStockLocations"),
    listAll(container.resolve(Modules.SALES_CHANNEL), "listSalesChannels", { is_disabled: false }),
    container.resolve(Modules.STORE).listStores(),
    listAll(container.resolve(Modules.FULFILLMENT), "listShippingProfiles"),
  ])
  return { ...feed, source: sourceLabel(source),
    products: feed.products.map(p => {
      const existing = findImported(products, p)
      return { ...p, ...(existing ? { existing: { id: existing.id, title: existing.title, status: existing.status,
        updated_at: new Date(existing.updated_at).toISOString(), category_ids: existing.categories?.map((c: any) => c.id) || [] } } : {}) }
    }),
    categories: categories.map(c => ({ id: c.id, name: c.name, parent_category_id: c.parent_category_id })),
    locations: locations.map(l => ({ id: l.id, name: l.name })), sales_channels: channels.map(c => ({ id: c.id, name: c.name })),
    shipping_profiles: profiles.map(p => ({ id: p.id, name: p.name })),
    default_shipping_profile_id: chooseShippingProfile(profiles)?.id || "",
    default_location_id: locations.find(l => l.id === (process.env.ROZETKA_STOCK_LOCATION_ID || "sloc_01KNA4KNCV0D9RQYWKD6R2DY76"))?.id || locations[0]?.id || "",
    default_sales_channel_id: channels.find(c => c.id === stores[0]?.default_sales_channel_id)?.id || channels[0]?.id || "",
    translation_available: Boolean(process.env.GOOGLE_TRANSLATE_API_KEY && process.env.GOOGLE_TRANSLATE_API_KEY !== "YOUR_GOOGLE_KEY"),
  }
}

// One shared PostgreSQL lock covers all workers and SKU conflicts between different source products.
export async function withImportLock<T>(container: MedusaContainer, work: () => Promise<T>): Promise<T> {
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const connection = await db.client.acquireConnection(); let locked = false
  try {
    const result = await db.raw("select pg_try_advisory_lock(18760430, 1) as locked").connection(connection)
    locked = Boolean(result.rows[0]?.locked)
    if (!locked) throw new ImportError(409, "Другой товар уже импортируется. Дождитесь завершения и повторите попытку.")
    return await work()
  } finally {
    try { if (locked) await db.raw("select pg_advisory_unlock(18760430, 1)").connection(connection) }
    finally { await db.client.releaseConnection(connection) }
  }
}

async function saveTranslations(container: MedusaContainer, id: string, draft: ImportDraft) {
  const service = container.resolve(Modules.TRANSLATION)
  for (const [locale, title, description] of [["sr-RS", draft.title_sr, draft.description_sr], ["en", draft.title_en, draft.description_en]]) {
    const rows = await service.listTranslations({ reference: "product", reference_id: id, locale_code: locale }, { take: 2 })
    const translations = { title: title || draft.title, description: description || draft.description }
    if (rows[0]) await service.updateTranslations({ id: rows[0].id, translations: { ...rows[0].translations, ...translations } })
    else await service.createTranslations({ reference: "product", reference_id: id, locale_code: locale, translations })
  }
}

export async function executeImport(container: MedusaContainer, body: unknown, actor: string): Promise<ImportResult> {
  const preliminary = importRequestSchema.safeParse(body)
  if (!preliminary.success) throw new ImportError(400, "Некорректные поля запроса импорта")
  const feed = await loadFeed(false, preliminary.data.source)
  const source = feed.products.find(p => p.key === preliminary.data.draft.key)
  if (!source) throw new ImportError(409, "Товар исчез из источника. Обновите предпросмотр.")
  const { draft, settings } = validateImport(body, source)
  return withImportLock(container, async () => {
    const module = container.resolve(Modules.PRODUCT), query = container.resolve(ContainerRegistrationKeys.QUERY)
    const inventory = container.resolve(Modules.INVENTORY)
    const products = await importedProducts(container)
    const existing = findImported(products, source)
    const hash = digest(JSON.stringify({ draft, settings })), marker = existing?.metadata?.rozetka_admin_import
    const resuming = marker?.request_hash === hash
    if (resuming && marker.state === "complete") return { product_id: existing.id, status: existing.status, action: "replayed", title: existing.title,
      warnings: await fillProductOptionTranslations(container, existing.id) }
    if (existing && !resuming) {
      if (draft.mode !== "update" || draft.existing_id !== existing.id) throw new ImportError(409, "Товар уже существует. Обновите предпросмотр и явно разрешите обновление.")
      if (new Date(existing.updated_at).toISOString() !== draft.existing_updated_at) throw new ImportError(409, "Товар изменён в админке после предпросмотра. Обновите список перед импортом.")
    }
    if (!existing && draft.existing_id) throw new ImportError(409, "Ранее найденный товар удалён. Обновите предпросмотр.")
    const [category, channel, location, profiles] = await Promise.all([
      module.retrieveProductCategory(draft.category_id, { select: ["id", "is_active", "is_internal"] }), container.resolve(Modules.SALES_CHANNEL).retrieveSalesChannel(settings.sales_channel_id),
      container.resolve(Modules.STOCK_LOCATION).retrieveStockLocation(settings.stock_location_id),
      listAll(container.resolve(Modules.FULFILLMENT), "listShippingProfiles"),
    ])
    if (!category.is_active || category.is_internal || channel.is_disabled || !location) throw new ImportError(400, "Проверьте активную категорию, канал продаж и склад магазина")
    const shippingProfile = chooseShippingProfile(profiles, settings.shipping_profile_id)
    if (!shippingProfile) throw new ImportError(400, settings.shipping_profile_id
      ? "Выбранный профиль доставки удалён. Обновите источник и выберите профиль заново."
      : profiles.length ? "Выберите профиль доставки в блоке «Куда и как импортировать». В магазине нет профиля по умолчанию."
      : "В магазине нет профилей доставки. Создайте профиль в настройках доставки и обновите источник.")
    const selected = draft.variants.filter(v => v.selected)
    const current = existing ? await module.retrieveProduct(existing.id, { relations: ["options", "options.values", "variants", "variants.options"] }) : undefined
    const colorEnabled = selected.some(v => v.color)
    const optionNames = colorEnabled ? ["Size", "Color"] : ["Size"]
    if (current && (current.options.length !== optionNames.length || current.options.some(o => !optionNames.includes(o.title)))) {
      throw new ImportError(409, "Схема опций существующего товара отличается. Сохраните его текущие опции Size/Color или измените их в обычной карточке товара.")
    }
    const matches = new Map<string, any>()
    for (const variant of selected) {
      const sourceVariant = source.variants.find(v => v.id === variant.id)!
      const match = current?.variants.find(v => v.metadata?.rozetka_offer_id === variant.id)
        ?? current?.variants.find(v => v.sku === sourceVariant.sku)
      if (match && (!match.manage_inventory || match.allow_backorder)) throw new ImportError(409, "У существующего варианта особые настройки остатков. Настройте их в карточке товара перед импортом.")
      if (match) matches.set(variant.id, match)
      const collisions = await module.listProductVariants({ sku: variant.sku }, { take: 2 })
      if (collisions.some(v => v.id !== match?.id)) throw new ImportError(409, `SKU ${variant.sku} уже используется другим вариантом`)
    }
    if (new Set([...matches.values()].map(v => v.id)).size !== matches.size) throw new ImportError(409, "Несколько предложений соответствуют одному варианту магазина")
    // Do not collide with, delete or zero variants outside the administrator's selection.
    for (const v of current?.variants ?? []) {
      if ([...matches.values()].some(m => m.id === v.id)) continue
      const size = v.options.find(o => current?.options.find(p => p.id === o.option_id)?.title === "Size")?.value
      const color = v.options.find(o => current?.options.find(p => p.id === o.option_id)?.title === "Color")?.value || ""
      if (selected.some(s => s.size === size && s.color === color)) throw new ImportError(409, "Сочетание размера и цвета занято другим вариантом. Проверьте варианты товара.")
    }
    const text = rozetkaProductText(draft)
    const handle = rozetkaProductHandle(text.title, source.key, products, existing)
    let id = existing?.id as string | undefined
    const oldMetadata = { ...(existing?.metadata || {}) }
    // Product text is stored in native Medusa translations. Preserve unrelated legacy metadata.
    if (oldMetadata.i18n && typeof oldMetadata.i18n === "object") {
      oldMetadata.i18n = Object.fromEntries(Object.entries(oldMetadata.i18n).map(([lang, value]) => {
        const fields = { ...(value as any) }; delete fields.title; delete fields.description; return [lang, fields]
      }))
    }
    const metadata = { ...oldMetadata, rozetka_product_key: source.url, rozetka_admin_key: source.key,
      rozetka_url: source.url, rozetka_vendor: draft.vendor, rozetka_category_id: source.category_id,
      rozetka_source_fingerprint: source.fingerprint,
      rozetka_original_text: { title: draft.title, description: draft.description }, rozetka_text_version: 1,
      ...(existing?.handle && existing.handle !== handle ? { rozetka_legacy_handle: existing.handle } : {}),
      rozetka_admin_import: { request_hash: hash, state: "processing", actor, started_at: new Date().toISOString() } }
    const options = optionNames.map(title => ({ title, values: [...new Set(selected.map(v => title === "Size" ? v.size : v.color))] }))
    try {
      if (!id) {
        const { result } = await createProductsWorkflow(container).run({ input: { products: [{ ...text, handle,
          status: "draft", shipping_profile_id: shippingProfile.id, sales_channels: [{ id: settings.sales_channel_id }],
          options, variants: [], metadata }] } })
        id = result[0].id
      } else await module.updateProducts(id, { status: "draft", metadata })
      // All later failures leave an identifiable draft; a retry resumes this product, not a duplicate.
      const mediaMap: Record<string, string> = { ...(existing?.metadata?.rozetka_media || {}) }
      const images: { url: string }[] = []
      for (const url of draft.images) {
        if (settings.image_mode === "remote") { images.push({ url }); continue }
        if (!mediaMap[url]) {
          const disk = await statfs(process.cwd())
          if (disk.bavail * disk.bsize < 512 * 1024 * 1024) throw new ImportError(507, "Для копирования фотографий нужно не менее 512 МБ свободного места. Выберите ссылки на источник.", id)
          const file = await fetchSource(url, 8 * 1024 * 1024)
          if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mime)) throw new ImportError(422, "Фотография имеет неподдерживаемый формат", id)
          const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[file.mime]
          const created = await container.resolve(Modules.FILE).createFiles({ filename: `rozetka-${digest(url).slice(0, 24)}.${extension}`, mimeType: file.mime, content: file.body.toString("base64"), access: "public" })
          mediaMap[url] = created.url
          await module.updateProducts(id, { metadata: { ...metadata, rozetka_media: mediaMap } })
        }
        images.push({ url: mediaMap[url] })
      }
      if (current) for (const option of options) {
        const old = current.options.find(o => o.title === option.title)!
        await module.updateProductOptions(old.id, { values: [...new Set([...old.values.map(v => v.value), ...option.values])] })
      }
      await updateProductsWorkflow(container).run({ input: { products: [{ id, ...text, handle,
        status: "draft", shipping_profile_id: shippingProfile.id, category_ids: [draft.category_id], images, thumbnail: images[0]?.url ?? null,
        ...(draft.weight ? { weight: numberInput(draft.weight)! } : {}), ...(draft.material ? { material: draft.material } : {}),
        ...(draft.origin_country ? { origin_country: draft.origin_country.toLowerCase() } : {}),
        metadata: { ...metadata, rozetka_media: mediaMap } }] } })
      for (const variant of selected) {
        const match = matches.get(variant.id)
        const data = { title: [variant.size, variant.color].filter(Boolean).join(" / "), sku: variant.sku,
          options: { Size: variant.size, ...(colorEnabled ? { Color: variant.color } : {}) },
          prices: [{ currency_code: "rsd", amount: numberInput(variant.price)! }], manage_inventory: true, allow_backorder: false,
          metadata: { ...(match?.metadata || {}), rozetka_offer_id: variant.id, rozetka_url: source.url, rozetka_feed_source: digest(preliminary.data.source ? sourceLabel(preliminary.data.source) : ROZETKA_SOURCE),
            rozetka_params: source.variants.find(v => v.id === variant.id)?.params || [] } }
        if (match) await updateProductVariantsWorkflow(container).run({ input: { product_variants: [{ ...data, id: match.id }] } })
        else await createProductVariantsWorkflow(container).run({ input: { product_variants: [{ ...data, product_id: id }] } })
      }
      await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id: settings.stock_location_id, add: [settings.sales_channel_id] } })
      const { data: variants } = await query.graph({ entity: "product_variant", fields: ["id", "sku", "product_id", "inventory_items.inventory_item_id"], filters: { product_id: id, sku: selected.map(v => v.sku) } })
      if (variants.length !== selected.length) throw new ImportError(422, "Не все варианты созданы. Повторите импорт этого товара.", id)
      for (const v of variants) {
        if (v.inventory_items?.length !== 1) throw new ImportError(422, "У варианта нет единственного складского элемента. Проверьте его в админке.", id)
        const itemId = v.inventory_items[0]?.inventory_item_id
        if (!itemId) throw new ImportError(422, "Не найден складской элемент варианта", id)
        const levels = await inventory.listInventoryLevels({ inventory_item_id: itemId, location_id: settings.stock_location_id }, { take: 2 })
        const stock = numberInput(selected.find(s => s.sku === v.sku)!.stock)!
        if (levels[0] && Number(levels[0].reserved_quantity) > stock) throw new ImportError(409, "Остаток меньше уже зарезервированного количества. Увеличьте остаток перед повтором.", id)
        const level = { inventory_item_id: itemId, location_id: settings.stock_location_id, stocked_quantity: stock }
        if (levels[0]) await inventory.updateInventoryLevels([{ id: levels[0].id, ...level }])
        else await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: [level] } })
      }
      await saveTranslations(container, id, draft)
      const warnings = await fillProductOptionTranslations(container, id)
      // Preserve other sales channels while ensuring the selected one is linked.
      const { data: linked } = await query.graph({ entity: "product", fields: ["id", "sales_channels.id"], filters: { id } })
      const channelIds = [...new Set([settings.sales_channel_id, ...(linked[0]?.sales_channels?.flatMap(c => c ? [c.id] : []) || [])])]
      await updateProductsWorkflow(container).run({ input: { products: [{ id, status: draft.status,
        sales_channels: channelIds.map(channelId => ({ id: channelId })),
        metadata: { ...metadata, rozetka_media: mediaMap, rozetka_admin_import: { ...metadata.rozetka_admin_import, state: "complete", completed_at: new Date().toISOString() } } }] } })
      return { product_id: id, status: draft.status, title: text.title, action: existing ? "updated" : "created", warnings }
    } catch (error) {
      container.resolve(ContainerRegistrationKeys.LOGGER).error(`Rozetka import failed for ${source.key}, product ${id || "not created"}: ${error instanceof Error ? error.message : "unknown error"}`)
      if (error instanceof ImportError) { error.product_id ||= id; throw error }
      throw new ImportError(422, id ? "Импорт не завершён. Товар сохранён черновиком; повторите импорт или откройте товар для проверки. Подробности в журнале сервера." : "Не удалось создать товар. Проверьте SKU, настройки магазина и журнал сервера.", id)
    }
  })
}
