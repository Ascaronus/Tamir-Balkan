"use client"

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react"
import type { Locale } from "@/lib/i18n/config"
import type { Messages } from "@/lib/i18n/messages"
import { createTranslator, type TranslateFn } from "@/lib/i18n/translator"

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
  const value = useMemo(() => {
    const t = createTranslator(messages)
    return { locale, t }
  }, [locale, messages])

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
