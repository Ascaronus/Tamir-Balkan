import type { Locale } from "./config"

// Longest paths first so account subpages map before the account root.
const servicePaths = [
  ["account/forgot-password", "nalog/zaboravljena-lozinka"],
  ["account/register", "nalog/registracija"],
  ["account/login", "nalog/prijava"],
  ["account", "nalog"],
  ["cart", "korpa"],
] as const

/** Resolve public Serbian paths to the existing shared page implementations. */
export function internalStorePath(path: string): string {
  for (const [internal, serbian] of servicePaths) {
    const prefix = `/rs/${serbian}`
    if (path === prefix || path.startsWith(prefix + "/")) return `/rs/${internal}` + path.slice(prefix.length)
  }
  return path
}

/** Only public storefront paths are localized; APIs, assets and external URLs are untouched. */
export function localizedPath(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href
  const match = /^([^?#]*)(.*)$/.exec(href)!
  const path = internalStorePath(match[1]), suffix = match[2]
  if (path === "/" || path === "/en" || path === "/en/" || path === "/rs" || path === "/rs/") return (locale === "en" ? "/en" : "/rs") + suffix
  if (/^\/(rs|en)\/(catalog|products|cart|checkout|account|order|wishlist)(\/|$)/.test(path)) {
    if (locale === "sr") for (const [internal, serbian] of servicePaths) {
      const prefix = path.replace(/^\/(rs|en)\//, "")
      if (prefix === internal || prefix.startsWith(internal + "/")) return `/rs/${serbian}` + prefix.slice(internal.length) + suffix
    }
    return path.replace(/^\/(rs|en)/, locale === "en" ? "/en" : "/rs") + suffix
  }
  if (/^\/(?:en\/)?(privacy|terms|cookies)$/.test(path)) return (locale === "en" ? "/en" : "") + path.replace(/^\/en/, "") + suffix
  return href
}
export function productHandle(product: { handle?: string | null; metadata?: Record<string, unknown> | null }, locale: Locale): string {
  const english = product.metadata?.en_handle
  return locale === "en" && typeof english === "string" && english ? english : product.handle || ""
}
export function productPath(product: { handle?: string | null; metadata?: Record<string, unknown> | null }, locale: Locale): string {
  return `/${locale === "en" ? "en" : "rs"}/products/${encodeURIComponent(productHandle(product, locale))}`
}
export function englishReady(product: { metadata?: Record<string, unknown> | null }): boolean {
  return product.metadata?.en_content_ready === true && typeof product.metadata?.en_handle === "string" && Boolean(product.metadata.en_handle)
}
