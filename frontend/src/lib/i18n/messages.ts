import en from "@/messages/en.json"
import sr from "@/messages/sr.json"
import type { Locale } from "@/lib/i18n/config"

export type Messages = typeof sr

const byLocale: Record<Locale, Messages> = { sr, en }

export function getMessages(locale: Locale): Messages {
  return byLocale[locale]
}
