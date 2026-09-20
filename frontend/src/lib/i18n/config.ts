export const LOCALE_COOKIE = "store_locale"

export const locales = ["sr", "en"] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = "sr"

export function isLocale(v: string | undefined | null): v is Locale {
  return typeof v === "string" && (locales as readonly string[]).includes(v)
}

/**
 * Локаль для Store API Medusa (BCP 47). Должна совпадать с локалями в
 * Admin → Settings → Store → Locales и с переводами категорий (Translations).
 * @see https://docs.medusajs.com/learn/fundamentals/api-routes/localization
 */
export function medusaStoreLocale(locale: Locale): string {
  if (locale === "sr") return "sr-RS"
  return locale
}

/** Match the primary browser language; unsupported languages use Serbian.
 * Generic parameters also allow testing future regional/script locales.
 */
export function detectBrowserLocale<T extends string>(
  acceptLanguage: string | null | undefined,
  supported: readonly T[],
  fallback: T,
): T {
  const preferences = (acceptLanguage ?? "").split(",").flatMap((entry, index) => {
    const [raw, ...params] = entry.trim().split(";")
    const tag = raw.toLowerCase()
    if (!/^[a-z]{1,8}(-[a-z0-9]{1,8})*$/.test(tag) && tag !== "*") return []
    let quality = 1
    for (const param of params) {
      const match = /^q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i.exec(param.trim())
      if (!match) return []
      quality = Number(match[1])
    }
    return quality > 0 ? [{ tag, quality, index }] : []
  }).sort((a, b) => b.quality - a.quality || a.index - b.index)
  const primary = preferences[0]?.tag
  if (!primary || primary === "*") return fallback
  let tag = primary
  while (tag) {
    const exact = supported.find(locale => locale.toLowerCase() === tag)
    if (exact) return exact
    const cut = tag.lastIndexOf("-")
    if (cut < 0) break
    tag = tag.slice(0, cut)
  }
  const base = primary.split("-")[0]
  return supported.find(locale => locale.toLowerCase().split("-")[0] === base) ?? fallback
}
