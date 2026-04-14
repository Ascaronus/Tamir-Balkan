"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { useAuth } from "@/components/auth/AuthProvider"

type Country = { code: string; label: string }

const COUNTRIES: Country[] = [
  { code: "RS", label: "Serbia" },
  { code: "ME", label: "Montenegro" },
]

export function RegisterForm({ countryCode }: { countryCode: string }) {
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
        Create account
      </h1>
      <p className="mt-1 text-sm text-[var(--store-text-muted)]">
        Required fields: First name, Last name, Country, Postal code, Email,
        Phone.
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
            setError(e?.message || "Registration failed")
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              First name *
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
              Last name *
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
            Country *
          </span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            required
            className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              City
            </span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              Postal code *
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
            Email *
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
            Phone *
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
            Notes
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-24 rounded-xl border border-[var(--store-border)] px-3 py-2 text-sm"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            Password *
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
          {isMutating ? "Creating…" : "Create account"}
        </button>

        <div className="text-sm text-[var(--store-text-muted)]">
          Already have an account?{" "}
          <Link
            href={`/${countryCode}/account/login`}
            className="font-semibold text-[var(--store-accent)]"
          >
            Sign in
          </Link>
        </div>
      </form>
    </div>
  )
}

