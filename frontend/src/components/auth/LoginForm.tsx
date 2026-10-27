"use client"

import Link from "@/components/i18n/LocalizedLink"
import { useLocalizedRouter as useRouter } from "@/components/i18n/useLocalizedRouter"
import { useRef, useState } from "react"
import { useAuth } from "@/components/auth/AuthProvider"
import { useTranslations } from "@/components/i18n/LocaleProvider"

type LoginFormProps = {
  countryCode: string
  next?: "account" | "checkout"
  modal?: boolean
  onSuccess?: () => void
  onNavigate?: () => void
}

export function LoginForm({ countryCode, next = "account", modal = false, onSuccess, onNavigate }: LoginFormProps) {
  const t = useTranslations()
  const router = useRouter()
  const { login, isMutating } = useAuth()
  const submitting = useRef(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  return (
    <div className={modal ? "login-modal-form" : "auth-panel"}>
      {!modal && <>
      <h1 className="text-xl font-semibold text-[var(--store-text)]">
        {t("auth.login.title")}
      </h1>
      <p className="mt-1 text-sm text-[var(--store-text-muted)]">
        {t("auth.login.hint")}
      </p>

      </>}
      <form
        className="mt-6 grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (submitting.current || isMutating) return
          submitting.current = true
          setError(null)
          try {
            await login(email.trim(), password)
            if (modal) onSuccess?.()
            else router.push(`/${countryCode}/${next}`)
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : ""
            if (message === "CUSTOMER_PROFILE_MISSING") setError(t("auth.login.profileMissing"))
            else if (message.includes("TOO_MANY_REQUESTS")) setError(t("auth.login.tooMany"))
            else setError(t("auth.login.failed"))
          } finally {
            submitting.current = false
          }
        }}
      >
        <label className="grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            {t("auth.login.email")}
          </span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            name="email"
            autoComplete="username"
            type="email"
            required
            className="h-12 rounded border border-[var(--store-border)] px-3 text-sm"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            {t("auth.login.password")}
          </span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            name="password"
            autoComplete="current-password"
            type="password"
            required
            className="h-12 rounded border border-[var(--store-border)] px-3 text-sm"
          />
        </label>

        <Link onClick={onNavigate} className="text-sm font-medium text-[var(--store-accent)] underline" href={`/${countryCode}/account/forgot-password`}>{t("auth.reset.forgot")}</Link>

        {error ? (
          <div role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isMutating}
          className="mt-2 inline-flex h-12 items-center justify-center rounded bg-[var(--store-accent)] hover:bg-[var(--store-accent-hover)] px-6 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isMutating ? t("auth.login.signingIn") : t("auth.login.signIn")}
        </button>

        {modal ? <Link href={`/${countryCode}/account/register`} onClick={onNavigate} className="button-secondary login-register-link">{t("auth.login.signUp")}</Link> : <div className="text-sm text-[var(--store-text-muted)]">
          {t("auth.login.noAccount")}{" "}
          <Link
            href={`/${countryCode}/account/register`}
            className="font-semibold text-[var(--store-accent)]"
          >
            {t("auth.login.createOne")}
          </Link>
        </div>}
      </form>
    </div>
  )
}

