type SourceVariant = {
  sku?: string | null;
  metadata?: Record<string, unknown> | null;
  inventory_items?: ({ inventory_item_id?: string | null } | null)[] | null;
}
const inventoryIds = (variant: SourceVariant): string[] =>
  (variant.inventory_items ?? []).flatMap(item => item?.inventory_item_id ? [item.inventory_item_id] : [])
export function missingSourceInventory(variants: SourceVariant[], source: string, presentSkus: Set<string>): string[] {
  const missing = (v: SourceVariant) => v.metadata?.rozetka_feed_source === source && Boolean(v.sku) && !presentSkus.has(v.sku!)
  const protectedIds = new Set(variants.filter(v => !missing(v)).flatMap(inventoryIds))
  return [...new Set(variants.filter(missing).flatMap(inventoryIds))].filter(id => !protectedIds.has(id))
}
