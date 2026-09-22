"use client"

import Link from "next/link"
import { requestRegistrationCode, type RegistrationChallenge } from "@/lib/auth/auth-client"
import { useCaptcha } from "@/components/security/Captcha"
import { reviewErrorKey } from "@/lib/reviews/client"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "@/components/auth/AuthProvider"
import { useTranslations } from "@/components/i18n/LocaleProvider"

export function RegisterForm({ countryCode }: { countryCode: string }) {
  const submitLock = useRef(false)
  const { requestCaptcha, captcha } = useCaptcha("register")
  const [submitting, setSubmitting] = useState(false)
  const t = useTranslations()
  const router = useRouter()
  const { signup, isMutating } = useAuth()

  const defaultCountry = useMemo(() => {
    return "RS"
  }, [countryCode])

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [country, setCountry] = useState(defaultCountry)
  const [city, setCity] = useState("")
  const [postalCode, setPostalCode] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)

  const [challenge, setChallenge] = useState<RegistrationChallenge | null>(null)
  const [code, setCode] = useState("")
  const [retryAt, setRetryAt] = useState(0)
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!retryAt) return
    const update = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [retryAt])
  function showError(error: unknown) {
    const message = error instanceof Error ? error.message : ""
    if (message.includes("CAPTCHA_CANCELLED")) return
    if (message.includes("CAPTCHA")) { setError(t(reviewErrorKey(error))); return }
    const keys: Record<string, string> = {
      CODE_INVALID: "invalid", CODE_EXPIRED: "expired", CODE_ATTEMPTS: "attempts",
      CODE_COOLDOWN: "cooldown", CODE_SEND_FAILED: "sendFailed", ACCOUNT_EXISTS: "exists",
      TOO_MANY_REQUESTS: "tooMany", REGISTRATION_INVALID: "invalidProfile",
    }
    const key = Object.keys(keys).find(key => message.includes(key))
    setError(t(`auth.code.${key ? keys[key] : "failed"}`))
  }
  async function sendCode() {
    const captcha_token = await requestCaptcha()
    const next = await requestRegistrationCode(email, captcha_token)
    setChallenge(next); setCode(""); setSeconds(next.retry_after)
    setRetryAt(Date.now() + next.retry_after * 1000)
  }
  if (challenge) return (
    <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
      <h1 className="text-xl font-semibold">{t("auth.code.title")}</h1>
      <p className="mt-2 text-sm">{t("auth.code.sentTo")} <strong className="break-all">{email.trim().toLowerCase()}</strong></p>
      <aside role="note" className="mt-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
        <p className="font-bold">{t("auth.code.spamTitle")}</p>
        <p className="mt-1 text-sm">{t("auth.code.spamHint")}</p>
      </aside>
      <p className="mt-4 text-sm text-[var(--store-text-muted)]">{t("auth.code.rules")}</p>
      <form className="mt-4 grid gap-4" onSubmit={async e => {
        e.preventDefault()
        if (submitLock.current) return
        submitLock.current = true; setSubmitting(true); setError(null)
        try {
          await signup({ challenge_id: challenge.challenge_id, code, email: email.trim().toLowerCase(), password,
            first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim(), notes: notes.trim() || undefined,
            country_code: country.toLowerCase(), city: city.trim() || undefined, postal_code: postalCode.trim() })
          setPassword("")
          router.push(`/${countryCode}/account`)
        } catch (error) { showError(error) }
        finally { submitLock.current = false; setSubmitting(false) }
      }}>
        <label className="grid gap-2 text-sm font-medium">{t("auth.code.label")}
          <input autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required
            value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            className="h-14 w-full rounded-xl border border-[var(--store-border)] px-4 text-center text-2xl tracking-[0.3em]" />
        </label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={submitting || isMutating || code.length !== 6}
          className="min-h-11 rounded-full bg-[var(--store-text)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {t(submitting ? "auth.code.checking" : "auth.code.confirm")}
        </button>
        <button type="button" disabled={submitting || isMutating || seconds > 0} className="min-h-11 text-sm underline disabled:opacity-50" onClick={async () => {
          if (submitLock.current) return
          submitLock.current = true; setSubmitting(true); setError(null)
          try { await sendCode() } catch (error) { showError(error) }
          finally { submitLock.current = false; setSubmitting(false) }
        }}>{seconds > 0 ? t("auth.code.resendWait", { n: seconds }) : t("auth.code.resend")}</button>
        <button type="button" disabled={submitting || isMutating} className="min-h-10 text-sm underline" onClick={() => { setChallenge(null); setCode(""); setError(null) }}>{t("auth.code.edit")}</button>
        <Link className="text-center text-sm underline" href={`/${countryCode}/account/login`}>{t("auth.register.signInLink")}</Link>
      </form>
      {captcha}
    </div>
  )

  return (
    <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
      <h1 className="text-xl font-semibold text-[var(--store-text)]">
        {t("auth.register.title")}
      </h1>
      <p className="mt-1 text-sm text-[var(--store-text-muted)]">
        {t("auth.register.hint")}
      </p>

      <form
        className="mt-6 grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (submitLock.current) return
          submitLock.current = true
          setError(null)
          setSubmitting(true)
          try {
            await sendCode()
          } catch (error: unknown) {
            showError(error)
          } finally {
            submitLock.current = false
            setSubmitting(false)
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("auth.register.firstName")}
            </span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("auth.register.lastName")}
            </span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
            />
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            {t("auth.register.country")}
          </span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            required
            className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
          >
            <option value="RS">{t("countries.rs")}</option>
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("auth.register.city")}
            </span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("auth.register.postalCode")}
            </span>
            <input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              required
              className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
            />
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            {t("auth.register.email")}
          </span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            {t("auth.register.phone")}
          </span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            {t("auth.register.notes")}
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-24 rounded-xl border border-[var(--store-border)] px-3 py-2 text-sm"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            {t("auth.register.password")}
          </span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            minLength={8}
            maxLength={256}
            autoComplete="new-password"
            required
            className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
          />
        </label>

        {error ? (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isMutating || submitting}
          className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-[var(--store-text)] px-6 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isMutating || submitting ? t("auth.code.sending") : t("auth.code.send")}
        </button>

        <div className="text-sm text-[var(--store-text-muted)]">
          {t("auth.register.hasAccount")}{" "}
          <Link
            href={`/${countryCode}/account/login`}
            className="font-semibold text-[var(--store-accent)]"
          >
            {t("auth.register.signInLink")}
          </Link>
        </div>
      </form>
      {captcha}
    </div>
  )
}

