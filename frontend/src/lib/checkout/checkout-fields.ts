import { normalizePhone } from "@/lib/auth/registration-fields"

export type CheckoutFields = {
  firstName: string; lastName: string; email: string; phone: string;
  country: string; city: string; postalCode: string; address1: string;
  notes: string; consent: boolean;
}

// Apply the same checks to guests, saved addresses and custom account addresses.
export function checkoutErrors(fields: CheckoutFields): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const key of ["firstName", "lastName", "email", "phone", "city", "postalCode", "address1"] as const) {
    if (!fields[key].trim()) errors[key] = "required"
  }
  for (const key of ["firstName", "lastName"] as const) {
    if (fields[key].includes("@") || fields[key].length > 100) errors[key] = "name"
  }
  if (fields.email.trim() && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim()) || fields.email.trim().length > 254)) errors.email = "email"
  if (fields.phone.trim() && !/^\+[1-9]\d{7,14}$/.test(normalizePhone(fields.phone))) errors.phone = "phone"
  if (fields.postalCode.trim() && !/^\d{5}$/.test(fields.postalCode.trim())) errors.postalCode = "postalCode"
  if (fields.country !== "rs") errors.country = "required"
  for (const [key, limit] of [["city", 100], ["address1", 200], ["notes", 1000]] as const) {
    if (fields[key].length > limit) errors[key] = "length"
  }
  if (!fields.consent) errors.consent = "consent"
  return errors
}
