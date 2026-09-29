import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/** Reclaim a customer-only identity after proof of email ownership (OTP).
 * Deletion can leave a null link or a stale customer ID. Neither is an account.
 * Never release a live customer, another actor, or an identity shared with OAuth.
 */
export async function releaseDeletedCustomerIdentity(req: MedusaRequest) {
  const provider = req.params.auth_provider ?? req.params.provider
  const body = req.body as Record<string, unknown> | undefined
  if (provider !== "emailpass" || typeof body?.email !== "string" ||
      typeof body.password !== "string" || !body.password) return
  const email = body.email.trim().toLowerCase()
  if (!email || email.length > 254) return
  const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await db.transaction(async trx => {
  const { rows } = await trx.raw(`UPDATE auth_identity AS identity
    SET app_metadata = '{}'::jsonb, updated_at = now()
    WHERE identity.deleted_at IS NULL
      AND jsonb_exists(identity.app_metadata, 'customer_id')
      AND (identity.app_metadata - 'customer_id') = '{}'::jsonb
      AND NOT EXISTS (
        SELECT 1 FROM customer AS linked
        WHERE linked.id = identity.app_metadata->>'customer_id'
          AND linked.deleted_at IS NULL
      )
      AND EXISTS (
        SELECT 1 FROM provider_identity AS provider
        WHERE provider.auth_identity_id = identity.id AND provider.deleted_at IS NULL
          AND provider.provider = 'emailpass' AND lower(provider.entity_id) = ?
      )
      AND NOT EXISTS (
        SELECT 1 FROM provider_identity AS other
        WHERE other.auth_identity_id = identity.id AND other.deleted_at IS NULL
          AND other.provider <> 'emailpass'
      )
      AND NOT EXISTS (
        SELECT 1 FROM customer AS active
        WHERE lower(active.email) = lower(?) AND active.deleted_at IS NULL
          AND active.has_account = true
      ) RETURNING identity.id`, [email, email])
  // Old signups may have retained upper-case email. Only normalize the reclaimed
  // identity; never merge it with another provider identity.
  for (const row of rows) await trx.raw(`UPDATE provider_identity AS provider SET entity_id = ?
    WHERE provider.auth_identity_id = ? AND provider.provider = 'emailpass'
      AND provider.deleted_at IS NULL AND lower(provider.entity_id) = ?
      AND NOT EXISTS (SELECT 1 FROM provider_identity AS other
        WHERE other.provider = 'emailpass' AND other.entity_id = ?
          AND other.deleted_at IS NULL AND other.id <> provider.id)`, [email, row.id, email, email])
  })
}
