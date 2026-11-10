import { headers } from "next/headers"
import type { Locale } from "./i18n/config"
import { localizedPath } from "./i18n/paths"

/**
 * Public production origins. Any other host is treated as a non-searchable instance.
 * `tamir.ua` is the external Rozetka feed source, not one of our sites, so it is not listed here.
 */
export const SEARCHABLE_HOSTS = new Set(["tamir.rs", "www.tamir.rs"])
/** Crawling is allowed in robots.txt so Google can read this exclusion directive. */
export const ROBOTS_NOINDEX_TAG = "noindex, nofollow, noarchive, nosnippet"
export const PUBLIC_SITE_ORIGIN = "https://tamir.rs"

function normalizeHost(value: string | null | undefined): string {
  try {
    return new URL(`http://${value ?? ""}`).hostname.toLowerCase()
  } catch {
    return ""
  }
}

/**
 * Staging must stay out of the index: robots.txt alone is not enough, Google only
 * drops URLs already in the index when it can read noindex. Local plain-HTTP dev
 * hosts are skipped so local SEO checks keep working.
 */
export function hostBlocksSearchEngines(hostname: string | null | undefined, protocol?: string | null): boolean {
  const host = normalizeHost(hostname)
  // A request without a usable Host header is not a known public origin, so it is closed.
  if (!host) return true
  if (SEARCHABLE_HOSTS.has(host)) return false
  if (protocol === "https:") return true
  // Named local hosts answer a dev server over plain HTTP with no forwarded protocol.
  // IPv4 literals are only opened when the protocol says so, so the staging loopback
  // addresses keep answering exactly like the public staging host.
  if (host === "localhost" || host.endsWith(".localhost")) return false
  return !(protocol === "http:" && /^\d+\.\d+\.\d+\.\d+$/.test(host))
}

/** Request-time variant for route handlers, layouts and metadata files. */
export async function blocksSearchEngines(): Promise<boolean> {
  const requestHeaders = await headers()
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim()
  return hostBlocksSearchEngines(requestHeaders.get("host"), forwardedProto ? `${forwardedProto}:` : undefined)
}

/** Each page must apply the host restriction: child metadata replaces layout robots. */
export async function pageRobots(index = true) {
  if (await blocksSearchEngines()) return { index: false, follow: false, noarchive: true, nosnippet: true }
  return { index, follow: true }
}

export function siteUrl(path = "/"): string {
  // SEO URLs always describe the public shop, never the build host or staging env.
  const url = new URL(path, PUBLIC_SITE_ORIGIN)
  if (url.origin !== PUBLIC_SITE_ORIGIN) throw new Error("SEO URL must use the public storefront origin")
  return url.href
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}

/** Canonicals and hreflang describe public URLs, never internal rewrite targets. */
export function languageAlternates(srPath: string, locale: Locale, enPath?: string) {
  const en = enPath ?? localizedPath(srPath, "en")
  return { canonical: siteUrl(locale === "en" ? en : srPath),
    languages: { sr: siteUrl(srPath), en: siteUrl(en) } }
}
