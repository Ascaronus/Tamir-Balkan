"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { useAuth } from "@/components/auth/AuthProvider"
import { useTranslations } from "@/components/i18n/LocaleProvider"

export function RegisterForm({ countryCode }: { countryCode: string }) {
  const t = useTranslations()
  const router = useRouter()
  const { signup, isMutating } = useAuth()

  const defaultCountry = useMemo(() => {
    return countryCode.toLowerCase() === "me" ? "ME" : "RS"
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
          setError(null)
          try {
            await signup({
              email: email.trim(),
              password,
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              phone: phone.trim(),
              notes: notes.trim() || undefined,
              country_code: country.toLowerCase(),
              city: city.trim() || undefined,
              postal_code: postalCode.trim(),
            })
            router.push(`/${countryCode}/account`)
          } catch (e: any) {
            setError(e?.message || t("auth.register.failed"))
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
            <option value="ME">{t("countries.me")}</option>
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
          {isMutating ? t("auth.register.creating") : t("auth.register.submit")}
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
    </div>
  )
}

