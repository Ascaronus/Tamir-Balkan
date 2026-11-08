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

/** Medusa availability excludes reservations. Missing inventory is unknown; an absent catalogue variant is unavailable. */
export async function getVariantStock(variantIds: string[], salesChannelId?: string | null, signal?: AbortSignal): Promise<Record<string, number | null>> {
  const ids = [...new Set(variantIds.filter(Boolean))]
  const limits: Record<string, number | null> = {}
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100)
    const { products } = await sdk.client.fetch<{ products: HttpTypes.StoreProduct[] }>("/store/products", {
      query: {
        variants: { id: batch }, limit: batch.length,
        fields: "id,variants.id,variants.manage_inventory,variants.allow_backorder,+variants.inventory_quantity",
        ...(salesChannelId ? { sales_channel_id: [salesChannelId] } : {}),
      }, cache: "no-store", signal,
    })
    const variants = products.flatMap(product => product.variants ?? [])
    for (const id of batch) if (!variants.some(variant => variant.id === id)) limits[id] = 0
    for (const variant of variants) {
      if (!batch.includes(variant.id)) continue
      if (variant.manage_inventory === false || variant.allow_backorder) limits[variant.id] = null
      else if (variant.manage_inventory && typeof variant.inventory_quantity === "number" && Number.isFinite(variant.inventory_quantity)) {
        limits[variant.id] = Math.max(0, Math.floor(variant.inventory_quantity))
      }
    }
  }
  return limits
}

/** Only enrich a rejected mutation. Medusa remains the authority for stock and reservations. */
async function stockFailure(error: unknown, cart: Cart, variantId: string | null | undefined, quantity: number, replaceLineId?: string): Promise<unknown> {
  const status = (error as { status?: number } | null)?.status
  if (!variantId || (status !== undefined && status !== 400 && status !== 409) ||
      !/insufficient inventory|does not have the required inventory|not enough stock/i.test(errMessage(error))) return error
  try {
    const limit = (await getVariantStock([variantId], cart.sales_channel_id))[variantId]
    if (typeof limit !== "number") return error
    const inCart = (cart.items ?? []).filter(item => item.variant_id === variantId).reduce((sum, item) => sum + item.quantity, 0)
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

export function getOrCreateCart(countryCode: string, customerId: string | null = null): Promise<Cart> {
  const cc = countryCode.toLowerCase()
  const key = `${cc}:${customerId ?? "guest"}`
  const pending = pendingCarts.get(key)
  if (pending) return pending
  const request = loadOrCreateCart(cc, customerId).finally(() => pendingCarts.delete(key))
  pendingCarts.set(key, request)
  return request
}

async function loadOrCreateCart(countryCode: string, customerId: string | null): Promise<Cart> {
  const cc = countryCode.toLowerCase()
  const region = await getRegionByCountry(cc)
  if (!region?.id) {
    throw new Error(`No region found for country ${cc}`)
  }

  if (customerId) {
    const guestId = getStoredCartId()
    const restored = await sdk.client.fetch<{ cart_id: string; claimed_guest: boolean }>("/store/customer-cart", {
      method: "POST", cache: "no-store", body: { region_id: region.id, country_code: cc, guest_cart_id: guestId },
    })
    // Only clear the guest pointer that was actually claimed; a late response cannot clear a newer guest cart.
    if (restored.claimed_guest && getStoredCartId() === guestId) clearStoredCartId()
    const cart = await retrieveCart(restored.cart_id)
    if (!cart) throw new Error("CUSTOMER_CART_UNAVAILABLE")
    return cart
  }
  const existingId = getStoredCartId()
  if (existingId) {
    const existing = await retrieveCart(existingId).catch(error => {
      if ([401, 403].includes((error as { status?: number }).status ?? 0)) return null
      throw error
    })
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
    .create({ region_id: region.id, shipping_address: { country_code: cc } }, { fields: "+customer.has_account" })
    .then(({ cart }) => cart as Cart)

  if ((created as Cart & { customer?: { has_account?: boolean } }).customer?.has_account) throw new Error("Cart session changed")
  setStoredCartId(created.id)
  return created
}

export async function addToCart(params: {
  countryCode: string
  customerId?: string | null
  variantId: string
  quantity?: number
}): Promise<Cart> {
  const { countryCode, customerId = null, variantId, quantity = 1 } = params
  requireQuantity(quantity)
  let cart = await getOrCreateCart(countryCode, customerId)

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
    if (!customerId) clearStoredCartId()
    cart = await getOrCreateCart(countryCode, customerId)
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
  customerId?: string | null
  lineItemId: string
  quantity: number
}): Promise<Cart> {
  const { countryCode, customerId = null, lineItemId, quantity } = params
  requireQuantity(quantity)
  let cart = await getOrCreateCart(countryCode, customerId)

  try {
    const result = await sdk.store.cart.updateLineItem(cart.id, lineItemId, { quantity })
    return result.cart as Cart
  } catch (e) {
    if (!isCartAlreadyCompletedError(e)) throw await stockFailure(e, cart, cart.items?.find(item => item.id === lineItemId)?.variant_id, quantity, lineItemId)
    if (!customerId) clearStoredCartId()
    cart = await getOrCreateCart(countryCode, customerId)
    // line item от старой completed-корзины в новой нет — только свежая корзина
  }

  return cart
}

export async function removeLineItem(params: {
  countryCode: string
  customerId?: string | null
  lineItemId: string
}): Promise<Cart> {
  const { countryCode, customerId = null, lineItemId } = params
  let cart = await getOrCreateCart(countryCode, customerId)

  try {
    const result = await sdk.store.cart.deleteLineItem(cart.id, lineItemId)
    return result.parent as Cart
  } catch (e) {
    if (!isCartAlreadyCompletedError(e)) throw e
    // Позиции от старой корзины уже неактуальны — только новая пустая корзина
    if (!customerId) clearStoredCartId()
    cart = await getOrCreateCart(countryCode, customerId)
  }

  return cart
}

export async function clearCartId(customerId?: string | null) {
  if (!customerId) clearStoredCartId()
  if (typeof window !== "undefined") window.dispatchEvent(new Event("tb-cart-reset"))
}

