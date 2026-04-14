import type { HttpTypes } from "@medusajs/types"
import { sdk } from "@/lib/medusa"
import { getStoredCartId, setStoredCartId, clearStoredCartId } from "./cart-storage"
import { getRegionByCountry } from "@/lib/store/regions"

export type Cart = HttpTypes.StoreCart

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
  } catch {
    return null
  }
}

export async function getOrCreateCart(countryCode: string): Promise<Cart> {
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
        } catch {
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
    .create({ region_id: region.id })
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
  let cart = await getOrCreateCart(countryCode)

  const run = () =>
    sdk.store.cart.createLineItem(cart.id, {
      variant_id: variantId,
      quantity,
    })

  try {
    await run()
  } catch (e) {
    if (!isCartAlreadyCompletedError(e)) throw e
    clearStoredCartId()
    cart = await getOrCreateCart(countryCode)
    await sdk.store.cart.createLineItem(cart.id, {
      variant_id: variantId,
      quantity,
    })
  }

  const refreshed = await retrieveCart(cart.id)
  if (!refreshed) throw new Error("Failed to refresh cart")
  return refreshed
}

export async function updateLineItem(params: {
  countryCode: string
  lineItemId: string
  quantity: number
}): Promise<Cart> {
  const { countryCode, lineItemId, quantity } = params
  let cart = await getOrCreateCart(countryCode)

  try {
    await sdk.store.cart.updateLineItem(cart.id, lineItemId, { quantity })
  } catch (e) {
    if (!isCartAlreadyCompletedError(e)) throw e
    clearStoredCartId()
    cart = await getOrCreateCart(countryCode)
    // line item от старой completed-корзины в новой нет — только свежая корзина
  }

  const refreshed = await retrieveCart(cart.id)
  if (!refreshed) throw new Error("Failed to refresh cart")
  return refreshed
}

export async function removeLineItem(params: {
  countryCode: string
  lineItemId: string
}): Promise<Cart> {
  const { countryCode, lineItemId } = params
  let cart = await getOrCreateCart(countryCode)

  try {
    await sdk.store.cart.deleteLineItem(cart.id, lineItemId)
  } catch (e) {
    if (!isCartAlreadyCompletedError(e)) throw e
    // Позиции от старой корзины уже неактуальны — только новая пустая корзина
    clearStoredCartId()
    cart = await getOrCreateCart(countryCode)
  }

  const refreshed = await retrieveCart(cart.id)
  if (!refreshed) throw new Error("Failed to refresh cart")
  return refreshed
}

export async function clearCartId() {
  clearStoredCartId()
}

