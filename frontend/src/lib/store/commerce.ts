import type { HttpTypes } from "@medusajs/types"

/** null means no finite stock limit (unmanaged stock or backorders). */
export function stockLimit(variant?: Pick<HttpTypes.StoreProductVariant, "manage_inventory" | "allow_backorder" | "inventory_quantity">): number | null {
  if (!variant) return 0
  if (variant.manage_inventory === false || variant.allow_backorder) return null
  return typeof variant.inventory_quantity === "number" && Number.isFinite(variant.inventory_quantity) ? Math.max(0, Math.floor(variant.inventory_quantity)) : 0
}

export function canPurchase(variant?: HttpTypes.StoreProductVariant): boolean {
  const amount = variant?.calculated_price?.calculated_amount
  return Boolean(variant && typeof amount === "number" && Number.isFinite(amount) && amount >= 0 && stockLimit(variant) !== 0)
}

/** API ordering can change after an UPDATE. Keep existing rows in place. */
export function stableItems<T extends { id: string; created_at?: string | Date }>(items: T[], previous: { id: string }[] = []): T[] {
  const positions = new Map(previous.map((item, index) => [item.id, index]))
  return [...items].sort((a, b) => {
    const ai = positions.get(a.id), bi = positions.get(b.id)
    if (ai !== undefined || bi !== undefined) return (ai ?? Infinity) - (bi ?? Infinity)
    return String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id)
  })
}

export function requireQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Quantity must be a positive integer")
}

/** Preserve other selected options instead of silently switching size/color. */
export function matchingVariant(variants: HttpTypes.StoreProductVariant[], current: HttpTypes.StoreProductVariant | undefined, optionId: string, value: string) {
  return variants.find(v => v.options?.some(o => o.option_id === optionId && o.value === value) &&
    (current?.options ?? []).every(selected => selected.option_id === optionId ||
      v.options?.some(o => o.option_id === selected.option_id && o.value === selected.value)))
}
