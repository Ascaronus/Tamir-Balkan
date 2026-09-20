export const CONSENT_COOKIE = "tamir_consent_v1"
export const CONSENT_EVENT = "tamir:cookie-settings"
export const CONSENT_SYNC = "tamir_consent_sync"
export const CONSENT_AGE = 180 * 24 * 60 * 60
export const GA_ID = "G-0L34ZN3ZB6"
export type Consent = "accepted" | "rejected"

export function readConsent(cookie: string): Consent | null {
  const value = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(CONSENT_COOKIE + "="))?.slice(CONSENT_COOKIE.length + 1)
  return value === "accepted" || value === "rejected" ? value : null
}

export function saveConsent(value: Consent): boolean {
  try {
    document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${CONSENT_AGE}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`
  } catch { return false }
  try { localStorage.setItem(CONSENT_SYNC, `${value}:${Date.now()}`) } catch { /* Cookie remains authoritative. */ }
  return readConsent(document.cookie) === value
}

export function clearAnalyticsCookies() {
  const host = location.hostname
  const parts = host.split(".")
  const domains = ["", ...parts.map((_, i) => parts.slice(i).join(".")).filter(d => d.includes("."))]
  for (const entry of document.cookie.split(";")) {
    const name = entry.trim().split("=")[0]
    if (!/^(_ga($|_)|_gid$|_gat($|_))/.test(name)) continue
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ""}`
    }
  }
}

type AnalyticsWindow = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
  "ga-disable-G-0L34ZN3ZB6"?: boolean
}

export function startAnalytics(): boolean {
  if (readConsent(document.cookie) !== "accepted") return false
  const w = window as AnalyticsWindow
  if (document.getElementById("tamir-google-tag")) return true
  w[`ga-disable-${GA_ID}`] = false
  w.dataLayer = w.dataLayer || []
  // Google expects an Arguments object, not an array, for queued commands.
  // eslint-disable-next-line prefer-rest-params -- Google tag queues Arguments objects.
  w.gtag = function () { w.dataLayer!.push(arguments) }
  w.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" })
  w.gtag("consent", "update", { analytics_storage: "granted" })
  w.gtag("js", new Date())
  w.gtag("config", GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: CONSENT_AGE })
  const script = document.createElement("script")
  script.id = "tamir-google-tag"
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(script)
  return true
}

export function stopAnalytics() {
  const w = window as AnalyticsWindow
  w[`ga-disable-${GA_ID}`] = true
  document.getElementById("tamir-google-tag")?.remove()
  w.dataLayer = []
  w.gtag = () => {}
  clearAnalyticsCookies()
}
