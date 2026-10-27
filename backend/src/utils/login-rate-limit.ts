import { createHmac } from "node:crypto"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Brute-force protection for POST /auth/customer/emailpass. Only failed attempts are counted,
// so a legitimate user is never locked out by their own successful traffic. Window matches the
// audit spec: 5 failures per email+IP and 30 per IP per rolling hour (CGNAT-safe: one shared
// mobile NAT exit cannot lock out every customer).
export const LOGIN_EMAIL_FAIL_LIMIT = 5
export const LOGIN_IP_FAIL_LIMIT = 30

export const loginRateSchema = `
CREATE TABLE IF NOT EXISTS tamir_login_rate (
 key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS tamir_login_rate_expiry ON tamir_login_rate(expires_at);
`;

function hashLoginKey(value: string): string {
  const secret = process.env.REVIEW_RATE_SECRET || process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw Error("REVIEW_RATE_SECRET or JWT_SECRET of at least 32 characters is required")
  return createHmac("sha256", secret).update(value).digest("hex")
}

function isLoopback(value: string): boolean {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1"
}

/**
 * No `trust proxy` is enabled anywhere, so `req.ip` is the nginx peer (127.0.0.1).
 * When the TCP peer is loopback (nginx on the same host), the rightmost x-forwarded-for
 * entry is the client address nginx appended — a forged chain from the client sits to its
 * left. When the peer is public (backend port exposed directly), XFF is ignored entirely
 * so an attacker cannot forge headers to obtain a fresh quota.
 */
export function clientIp(req: MedusaRequest): string | null {
  const peer = req.socket?.remoteAddress ?? null
  if (peer && !isLoopback(peer)) return peer
  const header = req.headers["x-forwarded-for"]
  const chain = (Array.isArray(header) ? header.join(",") : header || "").split(",")
  const rightmost = chain[chain.length - 1]?.trim()
  if (rightmost && !isLoopback(rightmost)) return rightmost
  return peer
}

function failLimit(key: string): number {
  return key.startsWith("login-email:") ? LOGIN_EMAIL_FAIL_LIMIT : LOGIN_IP_FAIL_LIMIT
}

async function blockedRetrySeconds(db: any, key: string): Promise<number | null> {
  const { rows } = await db.raw(`SELECT count, expires_at FROM tamir_login_rate WHERE key = ?`, [key])
  if (!rows.length) return null
  const expires = new Date(rows[0].expires_at)
  if (expires <= new Date() || Number(rows[0].count) < failLimit(key)) return null
  return Math.max(1, Math.ceil((expires.getTime() - Date.now()) / 1000))
}

async function recordLoginFailure(db: any, key: string) {
  await db.raw(`INSERT INTO tamir_login_rate (key, count, expires_at) VALUES (?, 1, now() + interval '1 hour')
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN tamir_login_rate.expires_at < now() THEN 1 ELSE tamir_login_rate.count + 1 END,
    expires_at = CASE WHEN tamir_login_rate.expires_at < now() THEN now() + interval '1 hour' ELSE tamir_login_rate.expires_at END`, [key])
  await db("tamir_login_rate").where("expires_at", "<", new Date()).delete()
}

export function loginRateLimit(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  // If the throttle itself cannot run (missing secret, DB outage), never take sign-in down with it.
  const failOpen = (error: unknown) => {
    try { req.scope.resolve(ContainerRegistrationKeys.LOGGER)?.warn?.(`login rate limit unavailable: ${(error as Error)?.message ?? error}`) } catch { /* keep failing open */ }
    return next()
  }
  let db: any
  let keys: string[]
  try {
    db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const ip = clientIp(req)
    const email = (req.body as { email?: unknown } | undefined)?.email
    keys = []
    if (typeof email === "string" && email) keys.push(`login-email:${hashLoginKey(`${email.trim().toLowerCase()}|${ip ?? "unknown"}`)}`)
    if (ip) keys.push(`login-ip:${hashLoginKey(ip)}`)
  } catch (error) {
    return failOpen(error)
  }
  void (async () => {
    for (const key of keys) {
      const retryAfter = await blockedRetrySeconds(db, key)
      // Blocked requests never reach authentication and never reach the finish listener below.
      if (retryAfter !== null) return res.status(429).json({ code: "TOO_MANY_REQUESTS", message: "TOO_MANY_REQUESTS", retry_after: retryAfter })
    }
    // Count only authentication failures (400/401); successes and our own 429 above are not counted.
    res.on("finish", () => {
      if (res.statusCode !== 400 && res.statusCode !== 401) return
      void Promise.allSettled(keys.map(key => recordLoginFailure(db, key))).catch(() => undefined)
    })
    next()
  })().catch(failOpen)
}
