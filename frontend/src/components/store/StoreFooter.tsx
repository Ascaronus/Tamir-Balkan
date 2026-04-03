"use client"

import { useTranslations } from "@/components/i18n/LocaleProvider"

export function StoreFooter() {
  const t = useTranslations()
  return (
    <footer className="border-t border-[var(--store-border)] bg-[var(--store-bg-muted)] px-4 py-6 text-center text-xs text-[var(--store-text-muted)]">
      <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
    </footer>
  )
}
