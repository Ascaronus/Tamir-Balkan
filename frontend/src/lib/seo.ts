import { headers } from "next/headers"
import type { Locale } from "./i18n/config"
import { localizedPath } from "./i18n/paths"

/** Public production origins. Any other host is treated as a non-searchable instance. */
export const SEARCHABLE_HOSTS = new Set(["tamir.rs", "www.tamir.rs", "tamir.ua", "www.tamir.ua", "api.tamir.rs"])
/** nofollow keeps links crawlable so Google re-crawls the page and reads the directive again. */
export const ROBOTS_NOINDEX_TAG = "noindex, nofollow, noarchive, nosnippet"

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

export function siteUrl(path = "/"): string {
  const base = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://tamir.rs")
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("Invalid site URL")
  return new URL(path, base.origin).href
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
