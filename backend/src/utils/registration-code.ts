import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto"
import type { Knex } from "knex"
import { ReviewError } from "./review-validation"

export const registrationSchema = `CREATE TABLE IF NOT EXISTS tamir_registration_code (
 email text PRIMARY KEY, id text NOT NULL UNIQUE, code_hash text NOT NULL,
 expires_at timestamptz NOT NULL, sent_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0, customer_id text
);`
export function registrationEmail(value: unknown): string {
  if (typeof value !== "string") throw new ReviewError(400, "REGISTRATION_INVALID")
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ReviewError(400, "REGISTRATION_INVALID")
  return email
}
export function codeHash(id: string, code: string) {
  const secret = process.env.REVIEW_RATE_SECRET || process.env.JWT_SECRET || ""
  if (secret.length < 32) throw new ReviewError(503, "REGISTRATION_UNAVAILABLE")
  return createHmac("sha256", secret).update(`registration-code:${id}:${code}`).digest("hex")
}
export async function issueCode(db: Knex, email: string, send: (code: string) => Promise<void>) {
  return db.transaction(async trx => {
    // Serializes first send and resends even before the email has a table row.
    await trx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?, 78321))", [email])
    const previous = await trx("tamir_registration_code").where({ email }).forUpdate().first()
    const now = Date.now()
    if (previous && now - new Date(previous.sent_at).getTime() < 60000) throw new ReviewError(429, "CODE_COOLDOWN")
    const id = randomBytes(32).toString("hex")
    let code: string
    do { code = randomInt(0, 1000000).toString().padStart(6, "0") }
    while (previous && codeHash(previous.id, code) === previous.code_hash)
    const sent_at = new Date(now), expires_at = new Date(now + 600000)
    await trx("tamir_registration_code").insert({ email, id, code_hash: codeHash(id, code), sent_at, expires_at, attempts: 0, customer_id: null })
      .onConflict("email").merge()
    // On SMTP rejection roll back, retaining the previous usable code.
    await send(code)
    await trx.raw(`DELETE FROM tamir_registration_code WHERE email IN (
      SELECT email FROM tamir_registration_code WHERE expires_at < ?
      ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
    )`, [new Date(now - 86400000)])
    return { challenge_id: id, expires_at: expires_at.toISOString(), retry_after: 60 }
  })
}
export async function confirmCode(db: Knex, email: string, id: string, code: string,
  activate: (previousCustomerId: string | null) => Promise<string>) {
  const outcome = await db.transaction(async trx => {
    const row = await trx("tamir_registration_code").where({ email, id }).forUpdate().first()
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) return "CODE_EXPIRED"
    if (row.attempts >= 5) return "CODE_ATTEMPTS"
    const supplied = Buffer.from(codeHash(id, code), "hex"), expected = Buffer.from(row.code_hash, "hex")
    if (!/^\d{6}$/.test(code) || expected.length !== supplied.length || !timingSafeEqual(supplied, expected)) {
      await trx("tamir_registration_code").where({ email, id }).increment("attempts", 1)
      return row.attempts + 1 >= 5 ? "CODE_ATTEMPTS" : "CODE_INVALID"
    }
    // Keep the row locked until activation finishes. Retrying a lost response is safe.
    const customerId = await activate(row.customer_id)
    await trx("tamir_registration_code").where({ email, id }).update({ customer_id: customerId })
    return null
  })
  // Wrong attempts must commit before returning an error.
  if (outcome) throw new ReviewError(400, outcome)
}
