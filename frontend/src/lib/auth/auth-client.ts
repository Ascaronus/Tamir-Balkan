import type { HttpTypes } from "@medusajs/types"
import { sdk } from "@/lib/medusa"
import { clearStoredCartId } from "@/lib/cart/cart-storage"

/**
 * Аутентификация покупателя (H4). JWT живёт только в httpOnly-куке, а в
 * `authorization` его подставляет серверный прокси `/api/medusa/*`, поэтому
 * здесь нет никакой работы с токеном: `sdk.client.fetch` (auth type "session")
 * просто отправляет куку на свой origin.
 */

export async function retrieveCustomer(): Promise<HttpTypes.StoreCustomer | null> {
  try {
    const res = await sdk.client.fetch<{ customer: HttpTypes.StoreCustomer }>(
      "/store/customers/me", {
        method: "GET", cache: "no-store",
        query: { fields: "*addresses" },
      }
    )
    return res.customer ?? null
  } catch (error) {
    // Истёкшая/невалидная сессия → анонимный режим (прокси на 401 сам снимает куку).
    // Сетевые и 5xx ошибки (502/503) пробрасываем: транзиентный сбой не должен
    // выбрасывать покупателя из аккаунта.
    if ([401, 404].includes((error as { status?: number }).status ?? 0)) return null
    throw error
  }
}

export async function login(params: { email: string; password: string }) {
  // Не `sdk.auth.login`: js-sdk `FetchError` теряет `error`/`code` из ответа
  // бэкенда, а LoginForm и лимит попыток входа (H1, 429 + `retry_after`) показывают
  // пользователю именно `message` бэкенда. Куку ставит маршрут `/api/auth/login`.
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: params.email.trim().toLowerCase(), password: params.password }),
    cache: "no-store",
  })
  if (!res.ok) {
    let message = ""
    try {
      const data = (await res.json()) as { message?: unknown }
      if (data && typeof data.message === "string") message = data.message
    } catch {
      // не JSON — подставляем текст по статусу
    }
    throw Object.assign(new Error(message || "Login failed"), { status: res.status })
  }
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
  terms_accepted: boolean
}) {
  const email = params.email.trim().toLowerCase()
  await sdk.client.fetch("/store/registration/verify", { method: "POST", body: { ...params, email }, cache: "no-store" })
  await login({ email, password: params.password })
  const customer = await retrieveCustomer()
  if (!customer) throw new Error("REGISTRATION_PROFILE_FAILED")
  return customer
}

export async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", cache: "no-store" })
  } catch {
    // Сети нет — кука всё равно снимется позже, а токен умрёт по своему `exp`.
  }
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
  const res = await sdk.store.customer.update(
    params as Record<string, unknown>,
    {}
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
      {}
    )
    return res.customer
  }
  const res = await sdk.store.customer.createAddress(
    body as Record<string, unknown>,
    {}
  )
  return res.customer
}
