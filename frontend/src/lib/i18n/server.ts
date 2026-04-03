import { cookies } from "next/headers"
import { LOCALE_COOKIE, defaultLocale, isLocale, type Locale } from "@/lib/i18n/config"
import { getMessages } from "@/lib/i18n/messages"
import { createTranslator } from "@/lib/i18n/translator"

export async function getLocale(): Promise<Locale> {
  const c = await cookies()
  const v = c.get(LOCALE_COOKIE)?.value
  return isLocale(v) ? v : defaultLocale
}

export async function getTranslations() {
  const locale = await getLocale()
  const messages = getMessages(locale)
  return { locale, messages, t: createTranslator(messages) }
}
