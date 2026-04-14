"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth/AuthProvider"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import {
  retrieveCustomer,
  updateCustomerProfile,
  upsertCustomerShippingAddress,
} from "@/lib/auth/auth-client"
import {
  customerToCheckoutForm,
  getDefaultAddressId,
} from "@/lib/checkout/apply-customer"

export function AccountProfileForm({ countryCode }: { countryCode: string }) {
  const t = useTranslations()
  const { customer, refresh } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address1, setAddress1] = useState("")
  const [city, setCity] = useState("")
  const [postalCode, setPostalCode] = useState("")
  const [country, setCountry] = useState<"rs" | "me">("rs")
  const [notes, setNotes] = useState("")
  const [addressId, setAddressId] = useState<string | null>(null)

  useEffect(() => {
    if (!customer) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setOk(false)
      try {
        const full = await retrieveCustomer()
        if (cancelled || !full) return
        const c = full as unknown as Record<string, unknown>
        const v = customerToCheckoutForm(c, countryCode)
        setFirstName(v.firstName)
        setLastName(v.lastName)
        setPhone(v.phone)
        setEmail(v.email)
        setAddress1(v.address1)
        setCity(v.city)
        setPostalCode(v.postalCode)
        setCountry(v.country)
        setNotes(v.notes)
        setAddressId(getDefaultAddressId(c))
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) setError(msg || t("account.profileLoadError"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [customer?.id, countryCode])

  if (!customer) return null

  return (
    <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
      <h2 className="text-lg font-semibold text-[var(--store-text)]">
        {t("account.profileSection")}
      </h2>
      <p className="mt-1 text-sm text-[var(--store-text-muted)]">
        {t("account.profileHint")}
      </p>

      {loading ? (
        <div className="mt-4 text-sm text-[var(--store-text-muted)]">
          {t("account.loading")}
        </div>
      ) : (
        <form
          className="mt-6 grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setSaving(true)
            setError(null)
            setOk(false)
            try {
              const current = await retrieveCustomer()
              const prevMeta =
                current &&
                typeof current.metadata === "object" &&
                current.metadata !== null &&
                !Array.isArray(current.metadata)
                  ? { ...(current.metadata as Record<string, unknown>) }
                  : {}
              if (notes.trim()) prevMeta.notes = notes.trim()
              else delete prevMeta.notes

              await updateCustomerProfile({
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                phone: phone.trim(),
                metadata: Object.keys(prevMeta).length ? prevMeta : undefined,
              })

              const wantAddress =
                addressId != null ||
                Boolean(
                  postalCode.trim() || address1.trim() || city.trim()
                )
              if (wantAddress) {
                if (!postalCode.trim()) {
                  throw new Error(t("account.postalRequired"))
                }
                await upsertCustomerShippingAddress({
                  addressId,
                  first_name: firstName.trim(),
                  last_name: lastName.trim(),
                  phone: phone.trim(),
                  address_1: address1.trim() || "-",
                  city: city.trim(),
                  postal_code: postalCode.trim(),
                  country_code: country,
                })
              }

              await refresh()
              setOk(true)
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err)
              setError(msg || t("account.profileSaveError"))
            } finally {
              setSaving(false)
            }
          }}
        >
          <p className="text-xs text-[var(--store-text-muted)]">
            {t("account.emailReadOnly")}
          </p>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("auth.register.email")}
            </span>
            <input
              value={email}
              readOnly
              className="h-11 cursor-not-allowed rounded-xl border border-[var(--store-border)] bg-neutral-50 px-3 text-sm"
            />
          </label>

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
              {t("auth.register.phone")}
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
            />
          </label>

          <h3 className="pt-2 text-sm font-semibold uppercase tracking-wider text-[var(--store-text-muted)]">
            {t("account.addressSection")}
          </h3>

          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("auth.register.country")}
            </span>
            <select
              value={country}
              onChange={(e) =>
                setCountry(e.target.value === "me" ? "me" : "rs")
              }
              className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
            >
              <option value="rs">{t("countries.rs")}</option>
              <option value="me">{t("countries.me")}</option>
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-medium text-[var(--store-text)]">
                {t("auth.register.postalCode")}
              </span>
              <input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm"
              />
            </label>
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
          </div>

          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.address")}
            </span>
            <input
              value={address1}
              onChange={(e) => setAddress1(e.target.value)}
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
              className="min-h-20 rounded-xl border border-[var(--store-border)] px-3 py-2 text-sm"
            />
          </label>

          {error ? (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {ok ? (
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {t("account.profileSaved")}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--store-text)] px-6 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? t("account.savingProfile") : t("account.saveProfile")}
          </button>
        </form>
      )}
    </div>
  )
}
