import type { Locale } from "./config"

/** Only public storefront paths are localized; APIs, assets and external URLs are untouched. */
export function localizedPath(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href
  const match = /^([^?#]*)(.*)$/.exec(href)!
  const path = match[1], suffix = match[2]
  if (path === "/" || path === "/en" || path === "/en/" || path === "/rs") return (locale === "en" ? "/en" : "/rs/catalog") + suffix
  if (/^\/(rs|en)\/(catalog|products|cart|checkout|account|order)(\/|$)/.test(path)) {
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
