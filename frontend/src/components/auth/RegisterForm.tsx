"use client"

import Link from "@/components/i18n/LocalizedLink"
import { formatPhone, normalizePhone, registrationCities, registrationErrors } from "@/lib/auth/registration-fields"
import { requestRegistrationCode, type RegistrationChallenge } from "@/lib/auth/auth-client"
import { useCaptcha } from "@/components/security/Captcha"
import { reviewErrorKey } from "@/lib/reviews/client"
import { useLocalizedRouter as useRouter } from "@/components/i18n/useLocalizedRouter"
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
  const [consent, setConsent] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [otherCity, setOtherCity] = useState(false)
  const [validated, setValidated] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const fieldErrors = validated ? registrationErrors({ firstName, lastName, email, phone, password, postalCode, city, notes, consent }) : {}
  const fieldProps = (name: string) => ({ id: `register-${name}`, name, "aria-invalid": Boolean(fieldErrors[name]), "aria-describedby": fieldErrors[name] ? `register-${name}-error` : undefined })
  const fieldError = (name: string) => fieldErrors[name] ? <span id={`register-${name}-error`} className="field-error">{t(`auth.validation.${fieldErrors[name]}`)}</span> : null
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
    <div className="auth-panel">
      <h1 className="text-xl font-semibold">{t("auth.code.title")}</h1>
      <p className="mt-2 text-sm">{t("auth.code.sentTo")} <strong className="break-all">{email.trim().toLowerCase()}</strong></p>
      <aside role="note" className="spam-notice mt-6 border-2 border-transparent">
        <p className="font-bold">{t("auth.code.spamTitle")}</p>
        <p className="mt-1 text-sm">{t("auth.code.spamHint")}</p>
      </aside>
      <p className="mt-4 text-sm text-[var(--store-text-muted)]">{t("auth.code.rules")}</p>
      <form noValidate className="mt-4 grid gap-4" onSubmit={async e => {
        e.preventDefault()
        if (submitLock.current || code.length !== 6) return
        submitLock.current = true; setSubmitting(true); setError(null)
        try {
          await signup({ challenge_id: challenge.challenge_id, code, email: email.trim().toLowerCase(), password,
            first_name: firstName.trim(), last_name: lastName.trim(), phone: normalizePhone(phone), terms_accepted: consent, notes: notes.trim() || undefined,
            country_code: country.toLowerCase(), city: city.trim() || undefined, postal_code: postalCode.trim() })
          setPassword("")
          router.push(`/${countryCode}/account`)
        } catch (error) { showError(error) }
        finally { submitLock.current = false; setSubmitting(false) }
      }}>
        <label className="grid gap-2 text-sm font-medium">{t("auth.code.label")}
          <div className="otp-control"><input autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required
            value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            aria-label={t("auth.code.label")} />
          <span className="otp-cells" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i}>{code[i] || ""}</span>)}</span></div>
        </label>
        {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={submitting || isMutating || code.length !== 6}
          className="min-h-12 rounded bg-[var(--store-accent)] hover:bg-[var(--store-accent-hover)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {t(submitting ? "auth.code.checking" : "auth.code.confirm")}
        </button>
        <button type="button" disabled={submitting || isMutating || seconds > 0} className="min-h-12 text-sm underline disabled:opacity-50" onClick={async () => {
          if (submitLock.current) return
          submitLock.current = true; setSubmitting(true); setError(null)
          try { await sendCode() } catch (error) { showError(error) }
          finally { submitLock.current = false; setSubmitting(false) }
        }}>{seconds > 0 ? t("auth.code.resendWait", { n: seconds }) : t("auth.code.resend")}</button>
        <button type="button" disabled={submitting || isMutating} className="min-h-10 text-sm underline" onClick={() => { setChallenge(null); setCode(""); setError(null) }}>{t("auth.code.edit")}</button>
        <p className="text-xs text-[var(--store-text-muted)]">{t("design.codeResendHint")}</p>
        <Link className="text-center text-sm underline" href={`/${countryCode}/account/login`}>{t("auth.register.signInLink")}</Link>
      </form>
      {captcha}
    </div>
  )

  return (
    <div className="auth-panel">
      <h1 className="text-xl font-semibold text-[var(--store-text)]">
        {t("auth.register.title")}
      </h1>
      <p className="mt-1 text-sm text-[var(--store-text-muted)]">
        {t("auth.register.hint")}
      </p>

      <form
        noValidate
        ref={formRef}
        className="mt-6 grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (submitLock.current) return
          setValidated(true)
          const errors = registrationErrors({ firstName, lastName, email, phone, password, postalCode, city, notes, consent })
          if (Object.keys(errors).length) {
            formRef.current?.querySelector<HTMLElement>(`[name="${Object.keys(errors)[0]}"]`)?.focus()
            return
          }
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
              {...fieldProps("firstName")}
              autoComplete="given-name"
              maxLength={60}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="h-12 rounded border border-[var(--store-border)] px-3 text-sm"
            />
            {fieldError("firstName")}
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("auth.register.lastName")}
            </span>
            <input
              {...fieldProps("lastName")}
              autoComplete="family-name"
              maxLength={100}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="h-12 rounded border border-[var(--store-border)] px-3 text-sm"
            />
            {fieldError("lastName")}
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
            className="h-12 rounded border border-[var(--store-border)] px-3 text-sm"
          >
            <option value="RS">{t("countries.rs")}</option>
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("auth.register.city")}
            </span>
            <select autoComplete="address-level2" value={otherCity ? "__other" : city} onChange={e => { setOtherCity(e.target.value === "__other"); setCity(e.target.value === "__other" ? "" : e.target.value) }} className="h-12 rounded border border-[var(--store-border)] px-3 text-sm">
              <option value="">{t("auth.validation.chooseCity")}</option>
              {registrationCities.map(name => <option key={name} value={name}>{name}</option>)}
              <option value="__other">{t("auth.validation.otherCity")}</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("auth.register.postalCode")}
            </span>
            <input
              {...fieldProps("postalCode")}
              autoComplete="postal-code"
              maxLength={5}
              value={postalCode}
              inputMode="numeric"
              placeholder="11000"
              onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
              required
              className="h-12 rounded border border-[var(--store-border)] px-3 text-sm"
            />
            {fieldError("postalCode")}
          </label>
        </div>

        {otherCity && <label className="grid gap-1 text-sm">{t("auth.validation.cityName")}<input autoComplete="address-level2" maxLength={100} value={city} onChange={e => setCity(e.target.value)} className="h-12 rounded border border-[var(--store-border)] px-3" /></label>}
        <label className="grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            {t("auth.register.email")}
          </span>
          <input
            {...fieldProps("email")}
              autoComplete="email"
              maxLength={254}
              value={email}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="ime@primer.com"
            onBlur={() => setEmail(email.trim().toLowerCase())}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            className="h-12 rounded border border-[var(--store-border)] px-3 text-sm"
          />
            {fieldError("email")}
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            {t("auth.register.phone")}
          </span>
          <input
            {...fieldProps("phone")}
              autoComplete="tel"
              maxLength={25}
              value={phone}
            type="tel"
            inputMode="tel"
            placeholder="+381 64 123 4567"
            onBlur={() => setPhone(formatPhone(phone))}
            onChange={(e) => setPhone(e.target.value.replace(/[^+0-9 ()-]/g, ""))}
            required
            className="h-12 rounded border border-[var(--store-border)] px-3 text-sm"
          />
            {fieldError("phone")}
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            {t("auth.register.notes")}
          </span>
          <textarea
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-24 rounded border border-[var(--store-border)] px-3 py-2 text-sm"
          />
        </label>

        <div className="grid gap-1">
          <label htmlFor="register-password" className="text-sm font-medium">{t("auth.register.password")}</label>
          <div className="password-control">
            <input {...fieldProps("password")} value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? "text" : "password"} minLength={8} maxLength={256} autoComplete="new-password" required placeholder="••••••••" />
            <button type="button" aria-controls="register-password" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{t(showPassword ? "auth.validation.hide" : "auth.validation.show")}</button>
          </div>
          <p className="field-hint">{t("auth.validation.passwordHint")}</p>
          {fieldError("password")}
        </div>
        <div>
          <div className="registration-consent">
            <input {...fieldProps("consent")} type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />
            <label htmlFor="register-consent">{t("auth.validation.agree")} <Link href="/terms" target="_blank">{t("auth.validation.terms")}</Link> {t("auth.validation.and")} <Link href="/privacy" target="_blank">{t("auth.validation.privacy")}</Link>.</label>
          </div>
          {fieldError("consent")}
        </div>

        {error ? (
          <div role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isMutating || submitting}
          className="mt-2 inline-flex h-12 items-center justify-center rounded bg-[var(--store-accent)] hover:bg-[var(--store-accent-hover)] px-6 text-sm font-semibold text-white disabled:opacity-60"
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

