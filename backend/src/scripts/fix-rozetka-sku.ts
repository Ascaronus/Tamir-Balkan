import type { ExecArgs } from '@medusajs/framework/types'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { updateProductVariantsWorkflow } from '@medusajs/medusa/core-flows'
import { importedProducts, withImportLock } from '../utils/rozetka-admin'
import { loadFeed } from '../utils/rozetka-preview'
import { DEFAULT_XML_URL } from '../shared/rozetka-import'
import { skuToken } from '../utils/rozetka'

type VariantRow = {
  id: string; sku: string | null; product_id: string
  metadata?: Record<string, unknown> | null
  inventory_items?: { inventory_item_id?: string }[]
}

/**
 * One-time, resumable SKU rewrite for already-imported Rozetka products: re-derives every variant SKU
 * from the current feed with the `АРТИКУЛ-РАЗМЕР` formula (utils/rozetka.ts) and stores the article and
 * the previous id-based SKU in variant metadata. Dry run by default; ROZETKA_SKU_FIX_APPLY=true writes.
 * Never touches prices, options, stock levels or SKUs of offers that are gone from the feed.
 */
export default async function fixRozetkaSku({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const apply = process.env.ROZETKA_SKU_FIX_APPLY === 'true'
  // Variants are written in batches: one workflow call per variant would mean thousands of them.
  const batch = Math.max(1, Number(process.env.ROZETKA_SKU_FIX_BATCH) || 25)
  const xmlUrl = ((args ?? [])[0] || process.env.ROZETKA_XML_URL || DEFAULT_XML_URL).trim()
  await withImportLock(container, async () => {
    const feed = await loadFeed(true, { type: 'url', url: xmlUrl })
    logger.info(`Rozetka SKU fix (${apply ? 'apply' : 'dry run'}): ${feed.products.length} feed products from ${xmlUrl}`)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const productModule = container.resolve(Modules.PRODUCT)
    const inventory = container.resolve(Modules.INVENTORY)
    const products = await importedProducts(container)
    const productById = new Map(products.map(p => [p.id, p]))
    const rozetkaIds = new Set(products
      .filter(p => p.metadata?.rozetka_product_key || p.metadata?.rozetka_admin_key)
      .map(p => p.id))

    const variants: VariantRow[] = []
    for (let skip = 0; ; skip += 200) {
      const { data } = await query.graph({
        entity: 'product_variant',
        fields: ['id', 'sku', 'product_id', 'metadata', 'inventory_items.inventory_item_id'],
        pagination: { skip, take: 200 },
      })
      variants.push(...(data as VariantRow[]))
      if (data.length < 200) break
      if (variants.length >= 50000) throw new Error('Catalog is too large for this script')
    }

    // Primary join is the importer-agnostic rozetka_offer_id; rozetka_legacy_sku/current sku is the
    // fallback for rows written before the metadata existed. rozetka_product_key differs per importer
    // (admin stores the source URL, CLI stores `<parentId>::<name>`), so products are only matched there.
    const byOfferId = new Map<string, VariantRow[]>()
    const byLegacy = new Map<string, VariantRow[]>()
    const push = (map: Map<string, VariantRow[]>, key: string, v: VariantRow) => {
      const list = map.get(key) ?? []; list.push(v); map.set(key, list)
    }
    for (const v of variants) {
      if (!rozetkaIds.has(v.product_id)) continue
      const meta = v.metadata || {}
      if (typeof meta.rozetka_offer_id === 'string' && meta.rozetka_offer_id) push(byOfferId, meta.rozetka_offer_id, v)
      if (typeof meta.rozetka_legacy_sku === 'string' && meta.rozetka_legacy_sku) push(byLegacy, meta.rozetka_legacy_sku, v)
      if (v.sku) push(byLegacy, v.sku, v)
    }

    // Everything the current feed offers, so that stored variants whose offer disappeared are recognised.
    const feedOfferIds = new Set<string>()
    const desiredOwners = new Map<string, string>()
    const usedVariants = new Set<string>()
    const changes: { variant: VariantRow; desired: string; article: string; legacy: string; size: string; meta: Record<string, unknown> }[] = []
    const conflicts: string[] = [], unmatched: string[] = []
    let unchanged = 0
    const touchedProducts = new Set<string>()
    for (const product of feed.products) {
      for (const sv of product.variants) {
        feedOfferIds.add(sv.id)
        const legacy = sv.legacy_sku || skuToken(sv.id)
        const desired = sv.sku
        const owner = desiredOwners.get(desired)
        if (owner && owner !== sv.id) {
          conflicts.push(`feed offers ${owner} and ${sv.id} both want SKU ${desired}`)
          continue
        }
        desiredOwners.set(desired, sv.id)
        let matches = byOfferId.get(sv.id) ?? []
        if (!matches.length) {
          const fallback = [...(byLegacy.get(legacy) ?? [])]
          matches = fallback.filter((v, index) => fallback.findIndex(c => c.id === v.id) === index)
        }
        if (!matches.length) { unmatched.push(`${sv.id} (${desired})`); continue }
        if (matches.length > 1) {
          conflicts.push(`offer ${sv.id}: ${matches.length} stored variants share the offer id (${matches.map(m => m.sku).join(', ')})`)
          continue
        }
        const v = matches[0]
        if (usedVariants.has(v.id)) { conflicts.push(`offer ${sv.id} maps to variant ${v.sku}, already used by another offer`); continue }
        usedVariants.add(v.id)
        const meta = { ...(v.metadata || {}) }
        const article = sv.article || ''
        const metadataChanged = meta.rozetka_article !== article || meta.rozetka_legacy_sku !== legacy
        if (v.sku === desired && !metadataChanged) { unchanged++; continue }
        const collisions = await productModule.listProductVariants({ sku: desired }, { take: 2 })
        const taken = collisions.find(c => c.id !== v.id)
        if (taken) { conflicts.push(`SKU ${desired} (offer ${sv.id}) is already used by variant ${taken.id}`); continue }
        changes.push({ variant: v, desired, article, legacy, size: sv.size, meta })
        touchedProducts.add(v.product_id)
      }
    }

    // SKUs of offers that left the feed are never rewritten, only reported for a manual decision.
    const stale: VariantRow[] = []
    for (const v of variants) {
      if (!rozetkaIds.has(v.product_id)) continue
      const offerId = typeof v.metadata?.rozetka_offer_id === 'string' ? v.metadata.rozetka_offer_id : ''
      if (offerId && !feedOfferIds.has(offerId)) stale.push(v)
    }

    // One workflow call per batch. This is the only place the script writes, apart from the
    // inventory_item.sku sync below.
    if (apply) {
      for (let i = 0; i < changes.length; i += batch) {
        // Same workflow and call shape the admin importer already uses to write sku+metadata together
        // (utils/rozetka-admin.ts, executeImport). Passing only id, sku and metadata leaves prices,
        // options and inventory links untouched.
        const chunk = changes.slice(i, i + batch)
        await updateProductVariantsWorkflow(container).run({
          input: {
            product_variants: chunk.map(c => ({
              id: c.variant.id,
              sku: c.desired,
              metadata: { ...c.meta, rozetka_article: c.article, rozetka_legacy_sku: c.legacy },
            })),
          },
        })
      }
    }

    // Stock levels are keyed by inventory_item_id + location and survive a variant SKU change; but the
    // separate inventory_item.sku column (indexed, and the CLI repair looks items up by sku, see
    // scripts/import-rozetka-xml.ts) would go stale, so it is synced below.
    const itemUpdates: { id: string; sku: string }[] = []
    const missingItems: string[] = []
    for (const c of changes) {
      const itemIds = (c.variant.inventory_items ?? []).map(i => i?.inventory_item_id).filter(Boolean) as string[]
      if (!itemIds.length) { missingItems.push(c.variant.sku || c.variant.id); continue }
      const items = await inventory.listInventoryItems({ id: itemIds }, { select: ['id', 'sku'] })
      for (const item of items) if (item.sku !== c.desired) itemUpdates.push({ id: item.id, sku: c.desired })
    }
    if (apply && itemUpdates.length) await inventory.updateInventoryItems(itemUpdates)

    for (const c of changes) {
      const handle = productById.get(c.variant.product_id)?.handle || c.variant.product_id
      logger.info(`${apply ? 'Fixing' : 'Would fix'} ${handle}: ${c.variant.sku} -> ${c.desired} (offer ${c.legacy}, size ${c.size}, article ${c.article || 'n/a'})`)
    }
    for (const line of conflicts) logger.warn(`SKU conflict: ${line}`)
    for (const v of stale) logger.warn(`Offer is gone from the feed, SKU left unchanged: ${v.sku} (offer ${v.metadata?.rozetka_offer_id})`)
    if (missingItems.length) logger.warn(`Variants without an inventory item (levels not affected, link them via the CLI import repair): ${missingItems.join(', ')}`)
    const metadataOnly = changes.filter(c => c.variant.sku === c.desired).length
    logger.info(`Rozetka SKU fix ${apply ? 'applied' : 'dry run'}: ${touchedProducts.size} products, ${changes.length - metadataOnly} SKU rewrites, ${metadataOnly} metadata only, ${unchanged} already correct, ${conflicts.length} conflicts, ${unmatched.length} feed offers without a stored variant, ${stale.length} offers gone from the feed, ${itemUpdates.length} inventory items ${apply ? 'synced' : 'to sync'}`)
    if (!apply) logger.info('This was a dry run. Set ROZETKA_SKU_FIX_APPLY=true to write these changes.')
  })
}

