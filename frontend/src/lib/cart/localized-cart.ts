import { productHandle } from '@/lib/i18n/paths'
import type { Cart } from './cart-client'
import type { Locale } from '@/lib/i18n/config'
import { localizedText } from '@/lib/i18n/content'

type ProductText = {
  id: string; title: string; handle: string; metadata?: Record<string, unknown> | null
  variants?: { id: string; title?: string | null; options?: { value: string }[] | null }[] | null
}
/** Overlay display fields only; quantities, prices and order snapshots stay server-owned. */
export function localizeCart(cart: Cart | null, products: ProductText[], locale: Locale): Cart | null {
  if (!cart) return cart
  const byId = new Map(products.map(product => [product.id, product]))
  return { ...cart, items: cart.items?.map(item => {
    const product = item.product_id ? byId.get(item.product_id) : undefined
    if (!product) return item
    const variant = product.variants?.find(value => value.id === item.variant_id)
    const variantTitle = variant?.options?.map(option => option.value).filter(Boolean).join(' / ') || variant?.title
    return { ...item, product_title: localizedText(product, 'title', product.title, locale),
      product_handle: productHandle(product, locale), variant_title: variantTitle || item.variant_title }
  }) }
}
export type { ProductText }
