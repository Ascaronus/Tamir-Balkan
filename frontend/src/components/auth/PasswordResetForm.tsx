"use client"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import { useCaptcha } from "@/components/security/Captcha"
import { requestPasswordReset, resetPassword } from "@/lib/auth/password-reset-client"
import type { RegistrationChallenge } from "@/lib/auth/auth-client"
import { reviewErrorKey } from "@/lib/reviews/client"

export function PasswordResetForm({ countryCode }: { countryCode: string }) {
  const t = useTranslations()
  const { requestCaptcha, captcha } = useCaptcha("password_reset")
  const lock = useRef(false)
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [challenge, setChallenge] = useState<RegistrationChallenge | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!retryAt) return
    const update = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)))
    update(); const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [retryAt])
  async function run(operation: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError("")
    try { await operation() }
    catch (e) {
      const message = e instanceof Error ? e.message : ""
      if (!message.includes("CAPTCHA_CANCELLED")) {
        const mapping: Record<string, string> = { CODE_INVALID: "auth.code.invalid", CODE_EXPIRED: "auth.code.expired",
          CODE_ATTEMPTS: "auth.code.attempts", CODE_COOLDOWN: "auth.code.cooldown", CODE_SEND_FAILED: "auth.code.sendFailed",
          TOO_MANY_REQUESTS: "auth.code.tooMany", PASSWORD_INVALID: "auth.reset.passwordHint", CODE_USED: "auth.reset.used" }
        const key = Object.keys(mapping).find(key => message.includes(key))
        setError(t(message.includes("CAPTCHA") ? reviewErrorKey(e) : key ? mapping[key] : "auth.reset.failed"))
      }
    } finally { lock.current = false; setBusy(false) }
  }
  async function send() {
    const token = await requestCaptcha()
    const next = await requestPasswordReset(email, token)
    setChallenge(next); setCode(""); setSeconds(next.retry_after); setRetryAt(Date.now() + next.retry_after * 1000)
  }
  if (done) return <div className="auth-panel"><h1 className="text-2xl font-semibold">{t("auth.reset.successTitle")}</h1>
    <p role="status" className="my-5 text-sm">{t("auth.reset.successHint")}</p>
    <Link href={`/${countryCode}/account/login`} className="button-primary w-full">{t("auth.login.signIn")}</Link></div>
  return <div className="auth-panel"><h1 className="text-2xl font-semibold">{t("auth.reset.title")}</h1>
    <p className="mt-3 text-sm text-[var(--store-text-muted)]">{t(challenge ? "auth.reset.sent" : "auth.reset.hint")}</p>
    {challenge && <><p className="mt-2 break-all text-sm font-semibold">{email.trim().toLowerCase()}</p>
      <aside role="note" className="spam-notice mt-5"><strong>{t("auth.code.spamTitle")}</strong><p className="mt-1 text-sm">{t("auth.code.spamHint")}</p></aside>
      <p className="mt-4 text-sm text-[var(--store-text-muted)]">{t("auth.code.rules")}</p></>}
    <form className="mt-6 grid gap-4" onSubmit={e => {
      e.preventDefault()
      if (challenge && password !== confirmation) { setError(t("auth.reset.mismatch")); return }
      void run(async () => {
        if (!challenge) { await send(); return }
        await resetPassword({ email, challenge_id: challenge.challenge_id, code, password })
        setPassword(""); setConfirmation(""); setCode(""); setDone(true)
      })
    }}>
      {!challenge ? <label className="grid gap-2 text-sm">{t("auth.login.email")}<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className="h-12 rounded border px-3" /></label> : <>
        <label className="grid gap-2 text-sm">{t("auth.reset.codeLabel")}<input autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} className="h-12 rounded border px-3 text-center text-xl tracking-[.3em]" /></label>
        <label className="grid gap-2 text-sm">{t("auth.reset.newPassword")}<input type="password" autoComplete="new-password" required minLength={8} maxLength={256} value={password} onChange={e => setPassword(e.target.value)} className="h-12 rounded border px-3" /></label>
        <label className="grid gap-2 text-sm">{t("auth.reset.confirmPassword")}<input type="password" autoComplete="new-password" required minLength={8} maxLength={256} value={confirmation} onChange={e => setConfirmation(e.target.value)} className="h-12 rounded border px-3" /></label>
        <p className="text-xs text-[var(--store-text-muted)]">{t("auth.reset.passwordHint")}</p>
      </>}
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy || Boolean(challenge && code.length !== 6)} className="button-primary w-full disabled:opacity-50">{t(busy ? "auth.reset.working" : challenge ? "auth.reset.save" : "auth.code.send")}</button>
      {challenge && <><button type="button" disabled={busy || seconds > 0} className="min-h-12 text-sm underline disabled:opacity-50" onClick={() => void run(send)}>{seconds ? t("auth.code.resendWait", { n: seconds }) : t("auth.code.resend")}</button>
        <button type="button" disabled={busy} className="min-h-10 text-sm underline" onClick={() => { setChallenge(null); setCode(""); setError("") }}>{t("auth.reset.changeEmail")}</button></>}
      <Link className="py-2 text-center text-sm underline" href={`/${countryCode}/account/login`}>{t("auth.register.signInLink")}</Link>
    </form>{captcha}</div>
}
