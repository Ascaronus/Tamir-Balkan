import { checkoutErrors } from "@/lib/checkout/checkout-fields"
export type ProfileFields = { firstName: string; lastName: string; phone: string; city: string; postalCode: string; address1: string; notes: string }
export function profileErrors(fields: ProfileFields): Record<string, string> {
  const errors = checkoutErrors({ ...fields, email: "profile@example.com", country: "rs", consent: true })
  // Saving contact details does not require adding a delivery address.
  if (![fields.city, fields.postalCode, fields.address1].some(value => value.trim())) {
    delete errors.city; delete errors.postalCode; delete errors.address1
  }
  return errors
}
