import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto"
import type { Knex } from "knex"
import { ReviewError } from "./review-validation"

export const passwordResetSchema = `CREATE TABLE IF NOT EXISTS tamir_password_reset (
 email text PRIMARY KEY, id text NOT NULL UNIQUE, code_hash text NOT NULL,
 expires_at timestamptz NOT NULL, sent_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0, consumed_at timestamptz,
 auth_identity_id text, customer_id text, password_version text
);`
function digest(id: string, code: string) {
  const secret = process.env.REVIEW_RATE_SECRET || process.env.JWT_SECRET || ""
  if (secret.length < 32) throw new ReviewError(503, "RESET_UNAVAILABLE")
  return createHmac("sha256", secret).update(`password-reset:${id}:${code}`).digest("hex")
}
export function validateNewPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 256) throw new ReviewError(400, "PASSWORD_INVALID")
  return value
}
export async function resetTarget(db: Knex, email: string) {
  const rows = await db("provider_identity as p")
    .join("auth_identity as a", "a.id", "p.auth_identity_id")
    .join("customer as c", db.raw("c.id = a.app_metadata->>'customer_id'"))
    .where({ "p.provider": "emailpass", "c.has_account": true })
    .whereRaw("lower(p.entity_id) = ? AND lower(c.email) = ?", [email, email])
    .whereNull("p.deleted_at").whereNull("a.deleted_at").whereNull("c.deleted_at")
    .select("a.id as auth_identity_id", "c.id as customer_id", "p.entity_id", "p.provider_metadata", "a.app_metadata")
  // Customer recovery must not change an identity also linked to an admin/vendor.
  if (rows.length !== 1 || Object.keys(rows[0].app_metadata || {}).some(key => key !== "customer_id")) return null
  const row = rows[0]
  if (typeof row.provider_metadata?.password !== "string") return null
  return { auth_identity_id: row.auth_identity_id as string, customer_id: row.customer_id as string,
    entity_id: row.entity_id as string, password_version: createHash("sha256").update(row.provider_metadata.password).digest("hex") }
}
export async function issuePasswordReset(db: Knex, email: string, send: (code: string) => Promise<void>) {
  return db.transaction(async trx => {
    await trx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?, 78322))", [email])
    const previous = await trx("tamir_password_reset").where({ email }).forUpdate().first()
    const now = Date.now()
    if (previous && now - new Date(previous.sent_at).getTime() < 60000) throw new ReviewError(429, "CODE_COOLDOWN")
    const target = await resetTarget(trx, email)
    const id = randomBytes(32).toString("hex")
    let code: string
    do { code = randomInt(0, 1000000).toString().padStart(6, "0") }
    while (previous && digest(previous.id, code) === previous.code_hash)
    const expires_at = new Date(now + 600000)
    await trx("tamir_password_reset").insert({ email, id, code_hash: digest(id, code), sent_at: new Date(now), expires_at,
      attempts: 0, consumed_at: null, auth_identity_id: target?.auth_identity_id || null,
      customer_id: target?.customer_id || null, password_version: target?.password_version || null }).onConflict("email").merge()
    if (target) await send(code)
    // Unknown/guest/deleted email receives the same public response, but no mail.
    await trx.raw(`DELETE FROM tamir_password_reset WHERE email IN (
      SELECT email FROM tamir_password_reset WHERE expires_at < ?
      ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
    )`, [new Date(now - 86400000)])
    return { challenge_id: id, expires_at: expires_at.toISOString(), retry_after: 60 }
  })
}
export async function confirmPasswordReset(db: Knex, email: string, id: string, code: string,
  update: (entityId: string) => Promise<void>) {
  const error = await db.transaction(async trx => {
    const row = await trx("tamir_password_reset").where({ email, id }).forUpdate().first()
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) return "CODE_EXPIRED"
    if (row.consumed_at) return "CODE_USED"
    if (row.attempts >= 5) return "CODE_ATTEMPTS"
    const expected = Buffer.from(row.code_hash, "hex"), supplied = Buffer.from(digest(id, code), "hex")
    if (!/^\d{6}$/.test(code) || expected.length !== supplied.length || !timingSafeEqual(supplied, expected)) {
      await trx("tamir_password_reset").where({ email, id }).increment("attempts", 1)
      return row.attempts + 1 >= 5 ? "CODE_ATTEMPTS" : "CODE_INVALID"
    }
    const target = await resetTarget(trx, email)
    if (!target || target.auth_identity_id !== row.auth_identity_id || target.customer_id !== row.customer_id ||
        target.password_version !== row.password_version) return "CODE_EXPIRED"
    await update(target.entity_id)
    await trx("tamir_password_reset").where({ email, id }).update({ consumed_at: new Date() })
    return null
  })
  if (error) throw new ReviewError(400, error)
}
