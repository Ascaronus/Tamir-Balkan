"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useAuth } from "@/components/auth/AuthProvider"
import { useTranslations } from "@/components/i18n/LocaleProvider"

export function LoginForm({ countryCode }: { countryCode: string }) {
  const t = useTranslations()
  const router = useRouter()
  const { login, isMutating } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
      <h1 className="text-xl font-semibold text-[var(--store-text)]">
        {t("auth.login.title")}
      </h1>
      <p className="mt-1 text-sm text-[var(--store-text-muted)]">
        {t("auth.login.hint")}
      </p>

      <form
        className="mt-6 grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setError(null)
          try {
            await login(email.trim(), password)
            router.push(`/${countryCode}/account`)
          } catch (e: any) {
            setError(e?.message || t("auth.login.failed"))
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
            type="email"
            required
            className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            {t("auth.login.password")}
          </span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
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
          disabled={isMutating}
          className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-[var(--store-text)] px-6 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isMutating ? t("auth.login.signingIn") : t("auth.login.signIn")}
        </button>

        <div className="text-sm text-[var(--store-text-muted)]">
          {t("auth.login.noAccount")}{" "}
          <Link
            href={`/${countryCode}/account/register`}
            className="font-semibold text-[var(--store-accent)]"
          >
            {t("auth.login.createOne")}
          </Link>
        </div>
      </form>
    </div>
  )
}

