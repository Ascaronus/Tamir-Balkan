import { ReviewError } from "./review-validation"

export async function verifyCaptcha(token: unknown, action: "register" | "review", fetcher = fetch) {
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
