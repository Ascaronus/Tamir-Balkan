export type ReorderItem = { variant_id?: string | null; quantity: number }
export function reorderTargets(existing: ReorderItem[], ordered: ReorderItem[]): Record<string, number> {
  const targets: Record<string, number> = {}
  for (const item of ordered) {
    if (!item.variant_id || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error("ORDER_ITEM_UNAVAILABLE")
    targets[item.variant_id] = (targets[item.variant_id] ?? existing.filter(i => i.variant_id === item.variant_id).reduce((n, i) => n + i.quantity, 0)) + item.quantity
  }
  return targets
}
export async function applyReorder(targets: Record<string, number>, steps: {
  items: () => Promise<ReorderItem[]>;
  add: (variantId: string, quantity: number) => Promise<void>;
}) {
  for (const [id, target] of Object.entries(targets)) {
    // Re-read after a failed/lost response: never blindly add the same quantity twice.
    const current = (await steps.items()).filter(i => i.variant_id === id).reduce((n, i) => n + i.quantity, 0)
    if (current < target) await steps.add(id, target - current)
  }
}
