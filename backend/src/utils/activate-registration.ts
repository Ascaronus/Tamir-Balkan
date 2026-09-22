import type { MedusaRequest } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows"
import { releaseDeletedCustomerIdentity } from "./deleted-customer-registration"
import { reviewDb } from "./review-http"
import { ReviewError } from "./review-validation"

export function registrationProfile(body: Record<string, unknown>) {
  function field(key: string, max: number, optional = false) {
    const value = body[key]
    if (optional && (value === undefined || value === "")) return ""
    if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) throw new ReviewError(400, "REGISTRATION_INVALID")
    return value.trim()
  }
  const password = body.password
  if (typeof password !== "string" || password.length < 8 || password.length > 256) throw new ReviewError(400, "REGISTRATION_INVALID")
  const first_name = field("first_name", 60)
  if (first_name.includes("@") || body.country_code !== "rs") throw new ReviewError(400, "REGISTRATION_INVALID")
  return { password, first_name, last_name: field("last_name", 100), phone: field("phone", 40),
    postal_code: field("postal_code", 20), city: field("city", 100, true), notes: field("notes", 1000, true) }
}
export async function activateRegistration(req: MedusaRequest, email: string, challengeId: string, profile: ReturnType<typeof registrationProfile>, previousId: string | null) {
  const db = reviewDb(req)
  const auth = req.scope.resolve(Modules.AUTH)
  const credentials = { body: { email, password: profile.password } }
  const existing = await db("customer").whereRaw("lower(email) = ?", [email]).where({ has_account: true }).whereNull("deleted_at").first()
  if (existing) {
    // Only a retry of this verified challenge can reuse an already-created account.
    if (existing.id !== previousId && existing.metadata?.registration_challenge !== challengeId) throw new ReviewError(409, "ACCOUNT_EXISTS")
    const login = await auth.authenticate("emailpass", credentials)
    if (!login.success || login.authIdentity?.app_metadata?.customer_id !== existing.id) throw new ReviewError(409, "ACCOUNT_EXISTS")
    return existing.id
  }
  if (previousId) throw new ReviewError(409, "ACCOUNT_EXISTS")
  // Called only after successful OTP verification, never from unverified signup.
  const oldParams = req.params, oldBody = req.body
  try {
    req.params = { ...req.params, auth_provider: "emailpass" }
    req.body = credentials.body
    await releaseDeletedCustomerIdentity(req)
  } finally { req.params = oldParams; req.body = oldBody }
  const registered = await auth.register("emailpass", credentials)
  if (!registered.success || !registered.authIdentity) throw new ReviewError(409, "ACCOUNT_EXISTS")
  const { result } = await createCustomerAccountWorkflow(req.scope).run({ input: {
    authIdentityId: registered.authIdentity.id,
    customerData: { email, first_name: profile.first_name, last_name: profile.last_name, phone: profile.phone,
      metadata: { notes: profile.notes || null, registration_challenge: challengeId, email_verified_at: new Date().toISOString() },
      addresses: [{ first_name: profile.first_name, last_name: profile.last_name, phone: profile.phone,
        address_1: "-", country_code: "rs", city: profile.city || undefined, postal_code: profile.postal_code,
        is_default_billing: true, is_default_shipping: true }],
    },
  } })
  return result.id
}
