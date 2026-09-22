"use client"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"

type Turnstile = { render: (element: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void }
declare global { interface Window { turnstile?: Turnstile } }
let loading: Promise<Turnstile> | null = null
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loading) return loading
  loading = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script")
    const fail = () => { clearTimeout(timer); script.remove(); loading = null; reject(Error("CAPTCHA_UNAVAILABLE")) }
    const timer = setTimeout(fail, 15000)
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    script.async = true
    script.onload = () => { clearTimeout(timer); if (window.turnstile) resolve(window.turnstile); else fail() }
    script.onerror = fail
    document.head.appendChild(script)
  })
  return loading
}
export function useCaptcha(action: "review" | "register") {
  const [open, setOpen] = useState(false)
  const pending = useRef<{ resolve: (token: string) => void; reject: (error: Error) => void } | null>(null)
  const settle = useCallback((token?: string) => {
    const current = pending.current
    pending.current = null
    setOpen(false)
    if (token) current?.resolve(token)
    else current?.reject(Error("CAPTCHA_CANCELLED"))
  }, [])
  const requestCaptcha = useCallback(() => {
    if (pending.current) return Promise.reject(Error("CAPTCHA_PENDING"))
    return new Promise<string>((resolve, reject) => { pending.current = { resolve, reject }; setOpen(true) })
  }, [])
  useEffect(() => () => { pending.current?.reject(Error("CAPTCHA_CANCELLED")); pending.current = null }, [])
  return { requestCaptcha, captcha: open ? <CaptchaDialog action={action} onComplete={settle} /> : null }
}
function CaptchaDialog({ action, onComplete }: { action: string; onComplete: (token?: string) => void }) {
  const { t, locale } = useLocaleContext()
  const dialog = useRef<HTMLDialogElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const title = useId()
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    let disposed = false
    let widget: string | undefined
    let api: Turnstile | undefined
    const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    Promise.resolve().then(async () => {
      if (!key) throw Error("CAPTCHA_UNAVAILABLE")
      api = await loadTurnstile()
      if (disposed || !container.current) return
      widget = api.render(container.current, { sitekey: key, action, theme: "light", size: "flexible", language: locale === "sr" ? "auto" : "en",
        callback: (token: string) => { if (!disposed) onComplete(token) },
        "error-callback": () => { if (!disposed) setError(true) },
        "expired-callback": () => { if (!disposed) setError(true) },
        "timeout-callback": () => { if (!disposed) setError(true) },
      })
    }).catch(() => { if (!disposed) setError(true) })
    return () => { disposed = true; if (widget !== undefined) api?.remove(widget) }
  }, [action, locale, attempt, onComplete])
  return <dialog ref={dialog} aria-labelledby={title} onCancel={e => { e.preventDefault(); onComplete() }} className="m-auto w-[min(92vw,380px)] rounded-2xl border border-[var(--store-border)] bg-white p-5 text-[var(--store-text)] shadow-xl backdrop:bg-black/30">
    <h2 id={title} className="font-semibold">{t("reviews.captchaTitle")}</h2>
    <p className="my-3 text-sm text-[var(--store-text-muted)]">{t("reviews.captchaHint")}</p>
    <div ref={container} className="min-h-16" />
    {error && <div role="alert" className="mt-3 text-sm"><p>{t("reviews.captchaFailed")}</p><button type="button" className="mt-2 underline" onClick={() => { setError(false); setAttempt(a => a + 1) }}>{t("reviews.retry")}</button></div>}
    <button type="button" onClick={() => onComplete()} className="mt-4 rounded-full border px-4 py-2 text-sm">{t("reviews.cancel")}</button>
  </dialog>
}
