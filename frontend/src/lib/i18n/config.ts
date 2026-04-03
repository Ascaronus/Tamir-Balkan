export const LOCALE_COOKIE = "store_locale"

export const locales = ["sr", "en"] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = "sr"

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "sr" || v === "en"
}

/**
 * Локаль для Store API Medusa (BCP 47). Должна совпадать с локалями в
 * Admin → Settings → Store → Locales и с переводами категорий (Translations).
 * @see https://docs.medusajs.com/learn/fundamentals/api-routes/localization
 */
export function medusaStoreLocale(locale: Locale): string {
  if (locale === "sr") return "sr-RS"
  return "en"
}
