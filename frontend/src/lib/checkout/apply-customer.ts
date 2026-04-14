export type CheckoutFormValues = {
  email: string
  firstName: string
  lastName: string
  phone: string
  country: "rs" | "me"
  city: string
  postalCode: string
  address1: string
  notes: string
}

export function normalizeCountryCode(cc: string | undefined | null): "rs" | "me" {
  const u = (cc || "rs").toLowerCase()
  return u === "me" ? "me" : "rs"
}

export function customerHasSavedAddressRecord(customer: {
  addresses?: unknown
}): boolean {
  const addrs = customer.addresses
  return Array.isArray(addrs) && addrs.length > 0
}

function pickDefaultAddress(customer: {
  addresses?: unknown
}): Record<string, unknown> | null {
  const addrs = customer.addresses
  if (!Array.isArray(addrs) || addrs.length === 0) return null
  const list = addrs as Record<string, unknown>[]
  return (
    list.find((a) => a.is_default_shipping) ||
    list.find((a) => a.is_default_billing) ||
    list[0] ||
    null
  )
}

export function customerToCheckoutForm(
  customer: Record<string, unknown>,
  catalogCountryCode: string
): CheckoutFormValues {
  const addr = pickDefaultAddress(customer)
  const email = String(customer.email ?? "").trim()
  const firstName = String(
    (addr?.first_name as string) || (customer.first_name as string) || ""
  ).trim()
  const lastName = String(
    (addr?.last_name as string) || (customer.last_name as string) || ""
  ).trim()
  const phone = String(
    (addr?.phone as string) || (customer.phone as string) || ""
  ).trim()
  const country = normalizeCountryCode(
    (addr?.country_code as string) || catalogCountryCode
  )
  const city = String(addr?.city ?? "").trim()
  const postalCode = String(addr?.postal_code ?? "").trim()
  const rawA = addr?.address_1
  const address1 =
    typeof rawA === "string" && rawA.trim() && rawA.trim() !== "-"
      ? rawA.trim()
      : ""
  const meta = customer.metadata as Record<string, unknown> | undefined
  const notes =
    typeof meta?.notes === "string" ? meta.notes : ""
  return {
    email,
    firstName,
    lastName,
    phone,
    country,
    city,
    postalCode,
    address1,
    notes,
  }
}

export function emptyCheckoutForm(catalogCountryCode: string): CheckoutFormValues {
  return {
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    country: normalizeCountryCode(catalogCountryCode),
    city: "",
    postalCode: "",
    address1: "",
    notes: "",
  }
}
