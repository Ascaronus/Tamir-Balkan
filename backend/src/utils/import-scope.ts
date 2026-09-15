type SourceVariant = {
  sku?: string | null;
  metadata?: Record<string, unknown> | null;
  inventory_items?: { inventory_item_id: string }[];
}
export function missingSourceInventory(variants: SourceVariant[], source: string, presentSkus: Set<string>): string[] {
  const missing = (v: SourceVariant) => v.metadata?.rozetka_feed_source === source && Boolean(v.sku) && !presentSkus.has(v.sku!)
  const protectedIds = new Set(variants.filter(v => !missing(v)).flatMap(v => v.inventory_items?.map(i => i.inventory_item_id) ?? []))
  return [...new Set(variants.filter(missing).flatMap(v => v.inventory_items?.map(i => i.inventory_item_id) ?? []))].filter(id => !protectedIds.has(id))
}
