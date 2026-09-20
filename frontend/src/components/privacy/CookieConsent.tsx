"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import { CONSENT_EVENT, CONSENT_SYNC, readConsent, saveConsent, startAnalytics, stopAnalytics, type Consent } from "@/lib/privacy/consent"

export function CookieSettingsButton() {
  const t = useTranslations()
  return <button type="button" className="underline underline-offset-4" onClick={() => window.dispatchEvent(new Event(CONSENT_EVENT))}>{t("cookies.settings")}</button>
}

export function CookieConsent() {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<Consent | null>(null)
  const [error, setError] = useState(false)
  const active = useRef(false)
  const previous = useRef<Consent | null | undefined>(undefined)
  const panel = useRef<HTMLElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    function sync() {
      const value = readConsent(document.cookie)
      setSaved(value)
      if (previous.current !== value) setOpen(value === null)
      previous.current = value
      if (value === "accepted") active.current = startAnalytics()
      else {
        stopAnalytics()
        // A reload removes already-executed Google listeners and timers, too.
        if (active.current) window.location.reload()
      }
    }
    function settings() {
      opener.current = document.activeElement as HTMLElement | null
      setOpen(true)
      requestAnimationFrame(() => panel.current?.focus())
    }
    function storage(event: StorageEvent) { if (event.key === CONSENT_SYNC || event.key === null) sync() }
    function visibility() { if (document.visibilityState === "visible") sync() }
    sync()
    window.addEventListener(CONSENT_EVENT, settings)
    window.addEventListener("storage", storage)
    document.addEventListener("visibilitychange", visibility)
    const timer = window.setInterval(sync, 60000)
    return () => {
      window.removeEventListener(CONSENT_EVENT, settings)
      window.removeEventListener("storage", storage)
      document.removeEventListener("visibilitychange", visibility)
      window.clearInterval(timer)
    }
  }, [])

  function choose(value: Consent) {
    const persisted = saveConsent(value)
    if (value === "rejected") {
      stopAnalytics()
      if (active.current && persisted) { window.location.reload(); return }
    }
    if (!persisted) { setError(true); return }
    setError(false)
    setSaved(value)
    previous.current = value
    setOpen(false)
    if (value === "accepted") active.current = startAnalytics()
    opener.current?.focus()
  }

  if (!open) return null
  const button = "min-h-11 rounded-lg border border-neutral-700 bg-white px-5 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2"
  return <section ref={panel} tabIndex={-1} role="region" aria-labelledby="cookie-title" className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-h-[80vh] max-w-3xl overflow-y-auto rounded-xl border border-neutral-300 bg-white p-5 text-neutral-950 shadow-xl sm:p-6">
    <h2 id="cookie-title" className="text-lg font-semibold">{t("cookies.title")}</h2>
    <p className="mt-2 text-sm">{t("cookies.description")}</p>
    <p className="mt-2 text-sm">{t("cookies.necessary")}</p>
    <Link href="/cookies" className="mt-2 inline-block text-sm underline">{t("cookies.policy")}</Link>
    {saved === "accepted" && <p className="mt-2 text-sm">{t("cookies.withdraw")}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{t("cookies.saveError")}</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" className={button} onClick={() => choose("rejected")}>{t("cookies.reject")}</button>
      <button type="button" className={button} onClick={() => choose("accepted")}>{t("cookies.accept")}</button>
      {saved && <button type="button" className={button} onClick={() => { setOpen(false); opener.current?.focus() }}>{t("cookies.close")}</button>}
    </div>
  </section>
}
