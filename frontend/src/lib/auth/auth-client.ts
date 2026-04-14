import type { HttpTypes } from "@medusajs/types"
import { sdk } from "@/lib/medusa"
import { clearAuthToken, getAuthToken, setAuthToken } from "./auth-storage"

function authHeaders(token: string | null): Record<string, string> {
  if (!token) return {}
  return { authorization: `Bearer ${token}` }
}

export async function retrieveCustomer(): Promise<HttpTypes.StoreCustomer | null> {
  const token = getAuthToken()
  if (!token) return null
  try {
    const res = await sdk.client.fetch<{ customer: HttpTypes.StoreCustomer }>(
      "/store/customers/me",
      {
        method: "GET",
        headers: authHeaders(token),
        cache: "no-store",
        query: { fields: "+addresses.*" } as Record<string, string>,
      }
    )
    return res.customer ?? null
  } catch {
    try {
      const res = await sdk.client.fetch<{ customer: HttpTypes.StoreCustomer }>(
        "/store/customers/me",
        {
          method: "GET",
          headers: authHeaders(token),
          cache: "no-store",
        }
      )
      return res.customer ?? null
    } catch {
      return null
    }
  }
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

export async function signup(params: {
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
  const token = await sdk.auth.register("customer", "emailpass", {
    email: params.email,
    password: params.password,
  })
  if (typeof token !== "string") {
    throw new Error("Unexpected register flow")
  }
  setAuthToken(token)

  const headers = authHeaders(token)
  const { customer } = await sdk.store.customer.create(
    {
      email: params.email,
      first_name: params.first_name,
      last_name: params.last_name,
      phone: params.phone,
      metadata: params.notes ? { notes: params.notes } : undefined,
    } as any,
    {},
    headers as any
  )

  await sdk.store.customer
    .createAddress(
      {
        first_name: params.first_name,
        last_name: params.last_name,
        address_1: "-",
        address_2: "",
        city: params.city || undefined,
        postal_code: params.postal_code,
        country_code: params.country_code,
        phone: params.phone,
        is_default_billing: true,
        is_default_shipping: true,
      } as any,
      {},
      headers as any
    )
    .catch(() => null)

  // Ensure we have a fresh login token for subsequent requests
  const loginToken = await sdk.auth.login("customer", "emailpass", {
    email: params.email,
    password: params.password,
  })
  if (typeof loginToken === "string") {
    setAuthToken(loginToken)
  }

  return customer
}

export async function logout() {
  clearAuthToken()
}

