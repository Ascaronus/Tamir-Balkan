import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/** Medusa 2.13 leaves { customer_id: null } after an admin deletes a customer.
 * Emailpass treats that nonempty object as an occupied identity. Normalize only
 * this exact tombstone; never release active accounts or identities of other actors.
 * Call only after registration CAPTCHA and rate limiting have succeeded.
 */
export async function releaseDeletedCustomerIdentity(req: MedusaRequest) {
  const provider = req.params.auth_provider ?? req.params.provider
  const body = req.body as Record<string, unknown> | undefined
  if (provider !== "emailpass" || typeof body?.email !== "string" ||
      typeof body.password !== "string" || !body.password) return
  const email = body.email
  if (!email || email.length > 254) return
  const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  // A single conditional UPDATE prevents stale reads from clearing a newly linked identity.
  await db.raw(`UPDATE auth_identity AS identity
    SET app_metadata = '{}'::jsonb, updated_at = now()
    WHERE identity.deleted_at IS NULL
      AND identity.app_metadata = '{"customer_id":null}'::jsonb
      AND EXISTS (
        SELECT 1 FROM provider_identity AS provider
        WHERE provider.auth_identity_id = identity.id AND provider.deleted_at IS NULL
          AND provider.provider = 'emailpass' AND provider.entity_id = ?
      )
      AND NOT EXISTS (
        SELECT 1 FROM provider_identity AS other
        WHERE other.auth_identity_id = identity.id AND other.deleted_at IS NULL
          AND other.provider <> 'emailpass'
      )
      AND EXISTS (
        SELECT 1 FROM customer AS deleted
        WHERE lower(deleted.email) = lower(?) AND deleted.deleted_at IS NOT NULL
          AND deleted.has_account = true
      )
      AND NOT EXISTS (
        SELECT 1 FROM customer AS active
        WHERE lower(active.email) = lower(?) AND active.deleted_at IS NULL
          AND active.has_account = true
      )`, [email, email, email])
}
