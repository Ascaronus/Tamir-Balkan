"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { locales, medusaStoreLocale, type Locale } from "@/lib/i18n/config"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { sdk } from "@/lib/medusa"

export function LanguageSwitcher() {
  const router = useRouter()
  const { locale, t } = useLocaleContext()
  const [busy, setBusy] = useState(false)

  async function setLocale(next: Locale) {
    if (next === locale || busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      })
      if (res.ok) {
        sdk.client.setLocale(medusaStoreLocale(next))
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-[var(--store-border)] bg-white/80 px-1 py-0.5"
      role="group"
      aria-label={t("lang.label")}
    >
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          disabled={busy}
          onClick={() => setLocale(code)}
          className={`rounded px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
            locale === code
              ? "bg-[var(--store-text)] text-white"
              : "text-[var(--store-text-muted)] hover:text-[var(--store-text)]"
          }`}
          title={code === "sr" ? t("lang.sr") : t("lang.en")}
        >
          {code}
        </button>
      ))}
    </div>
  )
}
