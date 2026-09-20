"use client"

import Link from "next/link"
import { CookieSettingsButton } from "@/components/privacy/CookieConsent"
import { useTranslations } from "@/components/i18n/LocaleProvider"

export function StoreFooter() {
  const t = useTranslations()
  return (
    <footer className="border-t border-[var(--store-border)] bg-[var(--store-bg-muted)] px-4 py-6 text-center text-xs text-[var(--store-text-muted)]">
      <nav aria-label={t("legal.links")} className="mb-4 flex flex-wrap justify-center gap-x-5 gap-y-3">
        <Link href="/terms" className="underline underline-offset-4">{t("legal.terms")}</Link>
        <Link href="/cookies" className="underline underline-offset-4">{t("cookies.policy")}</Link>
        <CookieSettingsButton />
      </nav>
      <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
    </footer>
  )
}
