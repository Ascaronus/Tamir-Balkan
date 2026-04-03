export const LOCALE_COOKIE = "store_locale"

export const locales = ["sr", "en"] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = "sr"

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "sr" || v === "en"
}
