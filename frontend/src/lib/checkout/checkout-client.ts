import type { HttpTypes } from "@medusajs/types"
import { sdk } from "@/lib/medusa"

export async function listShippingOptions(cartId: string) {
  const res = await sdk.client.fetch<{
    shipping_options: HttpTypes.StoreCartShippingOption[]
  }>("/store/shipping-options", {
    method: "GET",
    query: { cart_id: cartId } as any,
    cache: "no-store",
  })
  return res.shipping_options ?? []
}

export async function setCartAddresses(params: {
  cartId: string
  email: string
  shipping_address: {
    first_name: string
    last_name: string
    address_1: string
    city?: string
    postal_code: string
    country_code: string
    phone: string
  }
  notes?: string
}) {
  const { cartId, email, shipping_address, notes } = params
  return sdk.store.cart.update(
    cartId,
    {
      email,
      shipping_address,
      billing_address: shipping_address,
      metadata: notes ? { notes } : undefined,
    } as any
  )
}

export async function setShippingMethod(params: {
  cartId: string
  optionId: string
}) {
  const { cartId, optionId } = params
  return sdk.store.cart.addShippingMethod(cartId, { option_id: optionId } as any)
}

export async function listPaymentProviders(regionId: string) {
  const res = await sdk.client.fetch<HttpTypes.StorePaymentProviderListResponse>(
    "/store/payment-providers",
    {
      method: "GET",
      query: { region_id: regionId } as any,
      cache: "no-store",
    }
  )
  return res.payment_providers ?? []
}

export async function initiatePaymentSession(params: {
  cart: HttpTypes.StoreCart
  providerId: string
}) {
  const { cart, providerId } = params
  // js-sdk exposes store.payment in Medusa v2
  return (sdk.store.payment as any).initiatePaymentSession(cart, {
    provider_id: providerId,
  })
}

export async function completeCart(cartId: string) {
  return sdk.store.cart.complete(cartId) as any
}

