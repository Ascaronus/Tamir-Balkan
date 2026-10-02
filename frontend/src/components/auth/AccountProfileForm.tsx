"use client"

import { useEffect, useRef, useState } from "react"
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

import { formatPhone, normalizePhone, registrationCities } from "@/lib/auth/registration-fields"
import { profileErrors } from "@/lib/auth/profile-fields"

export function AccountProfileForm({ countryCode }: { countryCode: string }) {
  const saveLock = useRef(false)
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
  const [country, setCountry] = useState<"rs">("rs")
  const [notes, setNotes] = useState("")
  const [validated, setValidated] = useState(false)
  const [otherCity, setOtherCity] = useState(false)
  const fields = { firstName, lastName, phone, city, postalCode, address1, notes }
  const errors = validated ? profileErrors(fields) : {}
  const fieldProps = (name: string) => ({ id: `profile-${name}`, name, "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `profile-${name}-error` : undefined })
  const fieldError = (name: string) => errors[name] ? <span id={`profile-${name}-error`} className="field-error">{t(`auth.validation.${errors[name]}`)}</span> : null
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
        setPhone(formatPhone(v.phone))
        setEmail(v.email)
        setAddress1(v.address1)
        setCity(v.city)
        setOtherCity(Boolean(v.city && !registrationCities.includes(v.city)))
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
    <div className="profile-panel">
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
          noValidate
          className="profile-form checkout-form mt-6"
          onSubmit={async (e) => {
            e.preventDefault()
            if (saveLock.current) return
            setValidated(true)
            const invalid = profileErrors(fields)
            if (Object.keys(invalid).length) {
              document.getElementById(`profile-${Object.keys(invalid)[0]}`)?.focus()
              return
            }
            saveLock.current = true
            setSaving(true)
            setError(null)
            setOk(false)
            try {
              const wantAddress = addressId != null || Boolean(postalCode.trim() || address1.trim() || city.trim())
              if (wantAddress && !postalCode.trim()) throw new Error(t("account.postalRequired"))
              const current = await retrieveCustomer()
              if (!current) throw new Error(t("account.profileLoadError"))
              const prevMeta =
                current &&
                typeof current.metadata === "object" &&
                current.metadata !== null &&
                !Array.isArray(current.metadata)
                  ? { ...(current.metadata as Record<string, unknown>) }
                  : {}
              if (notes.trim()) prevMeta.notes = notes.trim()
              else prevMeta.notes = null

              await updateCustomerProfile({
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                phone: normalizePhone(phone),
                metadata: prevMeta,
              })

              if (wantAddress) {
                if (!postalCode.trim()) {
                  throw new Error(t("account.postalRequired"))
                }
                const updated = await upsertCustomerShippingAddress({
                  addressId: addressId ?? getDefaultAddressId(current as unknown as Record<string, unknown>),
                  first_name: firstName.trim(),
                  last_name: lastName.trim(),
                  phone: normalizePhone(phone),
                  address_1: address1.trim() || "-",
                  city: city.trim(),
                  postal_code: postalCode.trim(),
                  country_code: country,
                })
                setAddressId(getDefaultAddressId(updated as unknown as Record<string, unknown>))
              }

              await refresh()
              setOk(true)
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err)
              setError(msg || t("account.profileSaveError"))
            } finally {
              saveLock.current = false
              setSaving(false)
            }
          }}
        >
          <fieldset disabled={saving} className="profile-fields">
          <p className="text-xs text-[var(--store-text-muted)]">
            {t("account.emailReadOnly")}
          </p>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("auth.register.email")}
            </span>
            <input
              id="profile-email" type="email" autoComplete="email" value={email}
              readOnly
              className="h-12 cursor-not-allowed rounded border border-[var(--store-border)] bg-neutral-50 px-3 text-sm"
            />
          </label>

          <div className="profile-field-row">
            <label className="grid gap-1">
              <span className="text-sm font-medium text-[var(--store-text)]">
                {t("auth.register.firstName")}
              </span>
              <input
                {...fieldProps("firstName")} autoComplete="given-name" maxLength={100} value={firstName}
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
                {...fieldProps("lastName")} autoComplete="family-name" maxLength={100} value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="h-12 rounded border border-[var(--store-border)] px-3 text-sm"
              />
              {fieldError("lastName")}
            </label>
          </div>

          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("auth.register.phone")}
            </span>
            <input
              {...fieldProps("phone")} type="tel" inputMode="tel" autoComplete="tel" maxLength={25} placeholder="+381 64 123 4567" onBlur={() => setPhone(formatPhone(phone))} value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^+0-9 ()-]/g, ""))}
              required
              className="h-12 rounded border border-[var(--store-border)] px-3 text-sm"
            />
              {fieldError("phone")}
          </label>

          <h3 className="pt-2 text-sm font-semibold uppercase tracking-wider text-[var(--store-text-muted)]">
            {t("account.addressSection")}
          </h3>
          <p className="text-sm text-[var(--store-text-muted)]">{t("account.addressOptionalHint")}</p>

          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("auth.register.country")}
            </span>
            <select
              value={country}
              onChange={(e) =>
                setCountry("rs")
              }
              className="h-12 rounded border border-[var(--store-border)] px-3 text-sm"
            >
              <option value="rs">{t("countries.rs")}</option>
            </select>
          </label>

          <div className="profile-field-row">
            <label className="grid gap-1">
              <span className="text-sm font-medium text-[var(--store-text)]">
                {t("auth.register.postalCode").replace(/\s*\*$/, "")}
              </span>
              <input
                {...fieldProps("postalCode")} autoComplete="postal-code" inputMode="numeric" maxLength={5} value={postalCode}
                onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                className="h-12 rounded border border-[var(--store-border)] px-3 text-sm"
              />
              {fieldError("postalCode")}
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium text-[var(--store-text)]">
                {t("auth.register.city")}
              </span>
              <select {...(!otherCity ? fieldProps("city") : { id: "profile-city-choice" })} autoComplete="address-level2" value={otherCity ? "__other" : city} onChange={e => { setOtherCity(e.target.value === "__other"); setCity(e.target.value === "__other" ? "" : e.target.value) }}>
                <option value="">{t("auth.validation.chooseCity")}</option>
                {registrationCities.map(name => <option key={name} value={name}>{name}</option>)}
                <option value="__other">{t("auth.validation.otherCity")}</option>
              </select>
              {otherCity && <input {...fieldProps("city")} aria-label={t("auth.validation.otherCity")} autoComplete="address-level2" maxLength={100} value={city} onChange={e => setCity(e.target.value)} placeholder={t("auth.validation.otherCity")} />}
              {fieldError("city")}
            </label>
          </div>

          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.address").replace(/\s*\*$/, "")}
            </span>
            <input
              {...fieldProps("address1")} autoComplete="address-line1" maxLength={200} value={address1}
              onChange={(e) => setAddress1(e.target.value)}
              className="h-12 rounded border border-[var(--store-border)] px-3 text-sm"
            />
              {fieldError("address1")}
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("auth.register.notes")}
            </span>
            <textarea
              {...fieldProps("notes")} maxLength={1000} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-20 rounded border border-[var(--store-border)] px-3 py-2 text-sm"
            />
              {fieldError("notes")}
          </label>

          {error ? (
            <div role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {ok ? (
            <div role="status" className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {t("account.profileSaved")}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-12 items-center justify-center rounded bg-[var(--store-accent)] hover:bg-[var(--store-accent-hover)] px-6 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? t("account.savingProfile") : t("account.saveProfile")}
          </button>
          </fieldset>
        </form>
      )}
    </div>
  )
}
