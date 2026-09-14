"use client"
import { useTranslations } from "@/components/i18n/LocaleProvider"
export default function StoreError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations()
  return <main className="mx-auto max-w-xl p-10"><p role="alert">{t("common.loadFailed")}</p><button type="button" onClick={reset} className="mt-4 rounded-full border px-5 py-2">{t("common.retry")}</button></main>
}
