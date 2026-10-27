import type { Cart } from './cart-client'
import { productPath } from '@/lib/i18n/paths'
import type { Locale } from '@/lib/i18n/config'
type Item = NonNullable<Cart['items']>[number]
/** Preserve the existing cart fallbacks; server totals include promotions. */
export function cartLineTotal(item: Item): number { return item.total ?? item.unit_price * item.quantity }
export function cartProductsTotal(cart: Cart | null): number { return cart?.item_total ?? cart?.item_subtotal ?? cart?.subtotal ?? 0 }
/** product_handle has already been resolved for the active locale by localizeCart. */
export function cartLineHref(item: Item, locale: Locale): string | null {
  if (!item.product_handle) return null
  const path = productPath({ handle: item.product_handle }, locale)
  return item.variant_id ? `${path}?v_id=${encodeURIComponent(item.variant_id)}` : path
}
