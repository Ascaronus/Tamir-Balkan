import type { HttpTypes } from "@medusajs/types"
import { sdk } from "@/lib/medusa"
import { getStoredCartId, setStoredCartId, clearStoredCartId } from "./cart-storage"
import { getRegionByCountry } from "@/lib/store/regions"

export type Cart = HttpTypes.StoreCart

async function retrieveCart(cartId: string): Promise<Cart | null> {
  try {
    const res = await sdk.client.fetch<{ cart: Cart }>(`/store/carts/${cartId}`, {
      method: "GET",
      cache: "no-store",
    })
    return res.cart ?? null
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
          return updated
        } catch {
          // fall through and recreate
        }
      } else {
        return existing
      }
    } else {
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
  const cart = await getOrCreateCart(countryCode)

  await sdk.store.cart.createLineItem(cart.id, {
    variant_id: variantId,
    quantity,
  })

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
  const cart = await getOrCreateCart(countryCode)

  await sdk.store.cart.updateLineItem(cart.id, lineItemId, { quantity })

  const refreshed = await retrieveCart(cart.id)
  if (!refreshed) throw new Error("Failed to refresh cart")
  return refreshed
}

export async function removeLineItem(params: {
  countryCode: string
  lineItemId: string
}): Promise<Cart> {
  const { countryCode, lineItemId } = params
  const cart = await getOrCreateCart(countryCode)

  await sdk.store.cart.deleteLineItem(cart.id, lineItemId)

  const refreshed = await retrieveCart(cart.id)
  if (!refreshed) throw new Error("Failed to refresh cart")
  return refreshed
}

export async function clearCartId() {
  clearStoredCartId()
}

