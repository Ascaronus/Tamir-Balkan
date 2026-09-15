export type OrderReceipt = { id: string; display_id?: number; total?: number; currency_code?: string }
const key = "tamir_order_receipts"
export function saveReceipt(order: OrderReceipt) {
  try {
    const receipts = JSON.parse(sessionStorage.getItem(key) || "{}")
    receipts[order.id] = { id: order.id, display_id: order.display_id, total: order.total, currency_code: order.currency_code }
    sessionStorage.setItem(key, JSON.stringify(receipts))
  } catch { /* Confirmation will offer account lookup when session storage is unavailable. */ }
}
export function readReceipt(id: string): OrderReceipt | null {
  try { const value = JSON.parse(sessionStorage.getItem(key) || "{}")[id]; return value?.id === id ? value : null }
  catch { return null }
}
