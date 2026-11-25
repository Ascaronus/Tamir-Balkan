import { ReviewError } from "./review-validation"

// Pole that end-to-end tests send to ask for the CAPTCHA check to be skipped. On its
// own it grants nothing: the value must equal the stand's QA token.
export const QA_CAPTCHA_BYPASS_FIELD = "_qa_captcha_bypass"

// Storefronts where CAPTCHA is always mandatory: the opt-out cannot be enabled for
// any of them, whatever the environment says.
const PRODUCTION_STOREFRONT_HOSTS = ["tamir.rs", "www.tamir.rs"]

type BypassRequest = {
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}

// Host the server accepted the request on (Host header, without the port).
export function requestHost(req: BypassRequest): string {
  const host = (req.headers || {}).host
  const value = typeof host === "string" ? host : ""
  return value.split(",")[0].trim().toLowerCase().split(":")[0]
}

// Host of the request origin; empty when the header is missing or unparsable.
function requestOriginHost(req: BypassRequest): string {
  const origin = (req.headers || {}).origin
  if (typeof origin !== "string" || !origin) return ""
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    return ""
  }
}

// QA-only opt-out from the CAPTCHA check, for end-to-end tests on a stand where
// Turnstile is deliberately enabled. Fail-closed: no token means off, an empty host
// list means off, and an unlisted, production or Origin-mismatched host is refused.
// No combination of environment variables can enable it for tamir.rs.
export function captchaBypassAccepted(req: BypassRequest): boolean {
  const token = process.env.QA_CAPTCHA_BYPASS_TOKEN
  if (!token) return false
  const hosts = (process.env.QA_CAPTCHA_BYPASS_HOSTNAMES || "").split(",").map(x => x.trim()).filter(Boolean)
  if (!hosts.length) return false
  const host = requestHost(req)
  if (!host || !hosts.includes(host) || PRODUCTION_STOREFRONT_HOSTS.includes(host)) return false
  const originHost = requestOriginHost(req)
  if (originHost && originHost !== host) return false
  const body = req.body
  if (!body || typeof body !== "object" || Array.isArray(body)) return false
  return (body as Record<string, unknown>)[QA_CAPTCHA_BYPASS_FIELD] === token
}

export async function verifyCaptcha(token: unknown, action: "register" | "review" | "password_reset", fetcher = fetch) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  const hosts = (process.env.TURNSTILE_HOSTNAMES || "tamir.rs,www.tamir.rs").split(",").map(x => x.trim()).filter(Boolean)
  if (!secret || !hosts.length) throw new ReviewError(503, "CAPTCHA_UNAVAILABLE")
  if (typeof token !== "string" || !token || token.length > 2048) throw new ReviewError(400, "CAPTCHA_REQUIRED")
  let result: { success?: boolean; hostname?: string; action?: string }
  try {
    const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw Error("Unavailable")
    result = await response.json()
  } catch { throw new ReviewError(503, "CAPTCHA_UNAVAILABLE") }
  if (!result.success || result.action !== action || !hosts.includes(result.hostname || "")) throw new ReviewError(400, "CAPTCHA_FAILED")
}
