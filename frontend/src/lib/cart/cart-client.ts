import type { HttpTypes } from "@medusajs/types"
import { requireQuantity } from "@/lib/store/commerce"
import { sdk } from "@/lib/medusa"
import { getStoredCartId, setStoredCartId, clearStoredCartId } from "./cart-storage"
import { getRegionByCountry } from "@/lib/store/regions"

export type Cart = HttpTypes.StoreCart

export class CartStockError extends Error {
  readonly name = "CartStockError"
  constructor(readonly variantId: string, readonly available: number, readonly inCart: number) {
    super("CART_STOCK_LIMIT")
  }
}

/** Only enrich a rejected mutation. Medusa remains the authority for stock and reservations. */
async function stockFailure(error: unknown, cart: Cart, variantId: string | null | undefined, quantity: number, replaceLineId?: string): Promise<unknown> {
  const status = (error as { status?: number } | null)?.status
  if (!variantId || (status !== undefined && status !== 400 && status !== 409) ||
      !/insufficient inventory|does not have the required inventory|not enough stock/i.test(errMessage(error))) return error
  try {
    const { products } = await sdk.client.fetch<{ products: HttpTypes.StoreProduct[] }>("/store/products", {
      query: {
        variants: { id: variantId }, limit: 1,
        fields: "id,variants.id,variants.manage_inventory,variants.allow_backorder,+variants.inventory_quantity",
        ...(cart.sales_channel_id ? { sales_channel_id: [cart.sales_channel_id] } : {}),
      },
      cache: "no-store",
    })
    const variant = products.flatMap(product => product.variants ?? []).find(item => item.id === variantId)
    const available = variant?.inventory_quantity
    if (!variant?.manage_inventory || variant.allow_backorder || typeof available !== "number" || !Number.isFinite(available)) return error
    const inCart = (cart.items ?? []).filter(item => item.variant_id === variantId).reduce((sum, item) => sum + item.quantity, 0)
    const limit = Math.max(0, Math.floor(available))
    const requested = inCart + quantity - (replaceLineId ? cart.items?.find(item => item.id === replaceLineId)?.quantity ?? 0 : 0)
    // A different cart item may have caused Medusa's rejection, or stock may have changed since it.
    if (requested <= limit) return error
    return new CartStockError(variantId, limit, inCart)
  } catch {
    // Never invent a stock count or retry an addition when the diagnostic lookup fails.
    return error
  }
}

/** После оформления заказа корзина на бэкенде остаётся с `completed_at` — её нельзя менять, нужен новый cart. */
function isCartCompleted(cart: Cart): boolean {
  const c = cart as unknown as Record<string, unknown>
  return Boolean(c.completed_at)
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e ?? "")
}

/** Ответ Medusa при мутации уже завершённой корзины. */
function isCartAlreadyCompletedError(e: unknown): boolean {
  const m = errMessage(e).toLowerCase()
  return m.includes("completed") || m.includes("already completed")
}

async function retrieveCart(cartId: string): Promise<Cart | null> {
  try {
    const res = await sdk.client.fetch<{ cart: Cart }>(`/store/carts/${cartId}`, {
      method: "GET",
      cache: "no-store",
    })
    const cart = res.cart ?? null
    if (cart && isCartCompleted(cart)) return null
    return cart
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null
    throw error
  }
}

const pendingCarts = new Map<string, Promise<Cart>>()

export function getOrCreateCart(countryCode: string): Promise<Cart> {
  const cc = countryCode.toLowerCase()
  const pending = pendingCarts.get(cc)
  if (pending) return pending
  const request = loadOrCreateCart(cc).finally(() => pendingCarts.delete(cc))
  pendingCarts.set(cc, request)
  return request
}

async function loadOrCreateCart(countryCode: string): Promise<Cart> {
  const cc = countryCode.toLowerCase()
  const region = await getRegionByCountry(cc)
  if (!region?.id) {
    throw new Error(`No region found for country ${cc}`)
  }

  const existingId = getStoredCartId()
  if (existingId) {
    const existing = await retrieveCart(existingId)
    if (existing) {
      // Ensure region matches selected country
      if (existing.region_id && existing.region_id !== region.id) {
        try {
          const updated = await sdk.store.cart
            .update(existingId, { region_id: region.id })
            .then(({ cart }) => cart as Cart)
          if (isCartCompleted(updated)) {
            clearStoredCartId()
          } else {
            return updated
          }
        } catch (error) {
          if (!isCartAlreadyCompletedError(error)) throw error
          clearStoredCartId()
        }
      } else {
        return existing
      }
    } else {
      // null = не найдена или уже completed — сбрасываем id и создаём новую
      clearStoredCartId()
    }
  }

  const created = await sdk.store.cart
    .create({ region_id: region.id, shipping_address: { country_code: cc } })
    .then(({ cart }) => cart as Cart)

  setStoredCartId(created.id)
  return created
}

export async function addToCart(params: {
  countryCode: string
  variantId: string
  quantity?: number
}): Promise<Cart> {
  const { countryCode, variantId, quantity = 1 } = params
  requireQuantity(quantity)
  let cart = await getOrCreateCart(countryCode)

  const run = () =>
    sdk.store.cart.createLineItem(cart.id, {
      variant_id: variantId,
      quantity,
    })

  try {
    const result = await run()
    return result.cart as Cart
  } catch (e) {
    if (!isCartAlreadyCompletedError(e)) throw await stockFailure(e, cart, variantId, quantity)
    clearStoredCartId()
    cart = await getOrCreateCart(countryCode)
    try {
      const result = await sdk.store.cart.createLineItem(cart.id, { variant_id: variantId, quantity })
      return result.cart as Cart
    } catch (error) {
      throw await stockFailure(error, cart, variantId, quantity)
    }
  }

}

export async function updateLineItem(params: {
  countryCode: string
  lineItemId: string
  quantity: number
}): Promise<Cart> {
  const { countryCode, lineItemId, quantity } = params
  requireQuantity(quantity)
  let cart = await getOrCreateCart(countryCode)

  try {
    const result = await sdk.store.cart.updateLineItem(cart.id, lineItemId, { quantity })
    return result.cart as Cart
  } catch (e) {
    if (!isCartAlreadyCompletedError(e)) throw await stockFailure(e, cart, cart.items?.find(item => item.id === lineItemId)?.variant_id, quantity, lineItemId)
    clearStoredCartId()
    cart = await getOrCreateCart(countryCode)
    // line item от старой completed-корзины в новой нет — только свежая корзина
  }

  return cart
}

export async function removeLineItem(params: {
  countryCode: string
  lineItemId: string
}): Promise<Cart> {
  const { countryCode, lineItemId } = params
  let cart = await getOrCreateCart(countryCode)

  try {
    const result = await sdk.store.cart.deleteLineItem(cart.id, lineItemId)
    return result.parent as Cart
  } catch (e) {
    if (!isCartAlreadyCompletedError(e)) throw e
    // Позиции от старой корзины уже неактуальны — только новая пустая корзина
    clearStoredCartId()
    cart = await getOrCreateCart(countryCode)
  }

  return cart
}

export async function clearCartId() {
  clearStoredCartId()
  if (typeof window !== "undefined") window.dispatchEvent(new Event("tb-cart-reset"))
}

