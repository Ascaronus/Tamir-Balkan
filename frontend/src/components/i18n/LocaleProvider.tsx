"use client"

import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useLayoutEffect,
  type ReactNode,
} from "react"
import { medusaStoreLocale, type Locale } from "@/lib/i18n/config"
import { sdk } from "@/lib/medusa"
import type { Messages } from "@/lib/i18n/messages"
import { getMessages } from "@/lib/i18n/messages"
import { usePathname } from "next/navigation"
import { createTranslator, type TranslateFn } from "@/lib/i18n/translator"
import { restoreLocaleScroll } from "@/lib/i18n/locale-scroll"

type LocaleContextValue = {
  locale: Locale
  t: TranslateFn
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale
  messages: Messages
  children: ReactNode
}) {
  const pathname = usePathname()
  // Root layouts persist across client navigation; their server props can be old.
  const activeLocale = pathname ? (pathname === "/en" || pathname.startsWith("/en/") ? "en" : "sr") : locale
  const activeMessages = activeLocale === locale ? messages : getMessages(activeLocale)
  useEffect(() => { sdk.client.setLocale(medusaStoreLocale(activeLocale)) }, [activeLocale])
  useLayoutEffect(() => {
    document.documentElement.lang = activeLocale
    return restoreLocaleScroll()
  }, [activeLocale, pathname])
  const value = useMemo(() => {
    const t = createTranslator(activeMessages)
    return { locale: activeLocale, t }
  }, [activeLocale, activeMessages])

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  )
}

export function useLocaleContext() {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    throw new Error("useLocaleContext must be used within LocaleProvider")
  }
  return ctx
}

export function useTranslations() {
  return useLocaleContext().t
}
