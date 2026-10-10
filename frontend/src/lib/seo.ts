import type { Locale } from "./i18n/config"
import { localizedPath } from "./i18n/paths"
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
