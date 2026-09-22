import type { HttpTypes } from "@medusajs/types"
import { sdk } from "@/lib/medusa"
import { clearAuthToken, getAuthToken, setAuthToken } from "./auth-storage"
import { clearStoredCartId } from "@/lib/cart/cart-storage"

function authHeaders(token: string | null): Record<string, string> {
  if (!token) return {}
  return { authorization: `Bearer ${token}` }
}

async function customerForToken(token: string): Promise<HttpTypes.StoreCustomer | null> {
  try {
    const res = await sdk.client.fetch<{ customer: HttpTypes.StoreCustomer }>(
      "/store/customers/me", {
        method: "GET", headers: authHeaders(token), cache: "no-store",
        query: { fields: "*addresses" },
      }
    )
    return res.customer ?? null
  } catch (error) {
    if ([401, 404].includes((error as { status?: number }).status ?? 0)) return null
    throw error
  }
}

export async function retrieveCustomer(): Promise<HttpTypes.StoreCustomer | null> {
  const token = getAuthToken()
  return token ? customerForToken(token) : null
}

export async function login(params: { email: string; password: string }) {
  const token = await sdk.auth.login("customer", "emailpass", {
    email: params.email,
    password: params.password,
  })
  if (typeof token !== "string") {
    throw new Error("Unexpected login flow")
  }
  setAuthToken(token)
  return token
}

export type RegistrationChallenge = { challenge_id: string; expires_at: string; retry_after: number }
export async function requestRegistrationCode(email: string, captcha_token: string) {
  return sdk.client.fetch<RegistrationChallenge>("/store/registration/start", {
    method: "POST", body: { email: email.trim().toLowerCase(), captcha_token }, cache: "no-store",
  })
}
export async function signup(params: {
  challenge_id: string
  code: string
  email: string
  password: string
  first_name: string
  last_name: string
  phone: string
  notes?: string
  country_code: string
  city?: string
  postal_code: string
}) {
  const email = params.email.trim().toLowerCase()
  await sdk.client.fetch("/store/registration/verify", { method: "POST", body: { ...params, email }, cache: "no-store" })
  const token = await login({ email, password: params.password })
  const customer = await customerForToken(token)
  if (!customer) throw new Error("REGISTRATION_PROFILE_FAILED")
  return customer
}

export async function logout() {
  try {
    await sdk.auth.logout()
  } catch {
    await sdk.client.clearToken()
  }
  clearAuthToken()
  clearStoredCartId()
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("tb-cart-reset"))
  }
}

export async function updateCustomerProfile(params: {
  first_name?: string
  last_name?: string
  phone?: string
  metadata?: Record<string, unknown>
}) {
  const token = getAuthToken()
  if (!token) throw new Error("Not authenticated")
  const res = await sdk.store.customer.update(
    params as Record<string, unknown>,
    {},
    authHeaders(token) as never
  )
  return res.customer
}

export async function upsertCustomerShippingAddress(params: {
  addressId: string | null
  first_name: string
  last_name: string
  phone: string
  address_1: string
  city?: string
  postal_code: string
  country_code: string
}) {
  const token = getAuthToken()
  if (!token) throw new Error("Not authenticated")
  const h = authHeaders(token) as Record<string, string>
  const body = {
    first_name: params.first_name,
    last_name: params.last_name,
    phone: params.phone,
    address_1: params.address_1.trim() || "-",
    city: params.city?.trim() || undefined,
    postal_code: params.postal_code.trim(),
    country_code: params.country_code.toLowerCase(),
    is_default_shipping: true,
    is_default_billing: true,
  }
  if (params.addressId) {
    const res = await sdk.store.customer.updateAddress(
      params.addressId,
      body as Record<string, unknown>,
      {},
      h as never
    )
    return res.customer
  }
  const res = await sdk.store.customer.createAddress(
    body as Record<string, unknown>,
    {},
    h as never
  )
  return res.customer
}

