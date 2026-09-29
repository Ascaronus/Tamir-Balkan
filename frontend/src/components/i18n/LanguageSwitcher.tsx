"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { locales, medusaStoreLocale, type Locale } from "@/lib/i18n/config"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { sdk } from "@/lib/medusa"

export function LanguageSwitcher() {
  const router = useRouter()
  const { locale, t } = useLocaleContext()
  const [busy, setBusy] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)

  async function setLocale(next: Locale) {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      const res = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      })
      if (res.ok) {
        sdk.client.setLocale(medusaStoreLocale(next))
        startTransition(() => router.refresh())
      } else { setError(true) }
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="flex items-center gap-0.5"
      role="group"
      aria-label={t("lang.label")}
    >
      {error && <span role="alert" className="text-red-700">{t("common.retry")}</span>}
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          disabled={busy || pending}
          aria-pressed={locale === code}
          onClick={() => setLocale(code)}
          className={`min-h-11 px-1.5 text-xs uppercase transition ${
            locale === code
              ? "font-semibold text-[var(--store-accent)]"
              : "text-[var(--store-text-muted)] hover:text-[var(--store-text)]"
          }`}
          title={t(`lang.${code}`)}
        >
          {code}
        </button>
      ))}
    </div>
  )
}
