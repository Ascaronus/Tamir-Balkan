"use client"

import { checkoutErrors } from "@/lib/checkout/checkout-fields"
import { formatPhone, normalizePhone, registrationCities } from "@/lib/auth/registration-fields"
import type { HttpTypes } from "@medusajs/types"
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { useCart } from "@/components/cart/CartProvider"
import {
  customerHasSavedAddressRecord,
  customerToCheckoutForm,
  emptyCheckoutForm,
} from "@/lib/checkout/apply-customer"
import {
  completeCart,
  initiatePaymentSession,
  listPaymentProviders,
  listShippingOptions,
  setCartAddresses,
  setShippingMethod,
} from "@/lib/checkout/checkout-client"
import { formatMoney } from "@/lib/format-money"
import { saveReceipt } from "@/lib/checkout/receipt"
import { clearCartId } from "@/lib/cart/cart-client"
import { useTranslations } from "@/components/i18n/LocaleProvider"


function pickProviders(paymentProviders: { id: string }[]) {
  const stripe = paymentProviders.find((p) => p.id.toLowerCase().includes("stripe"))
  const system = paymentProviders.find((p) =>
    p.id.toLowerCase().includes("system")
  )
  return { stripe, system }
}

export function CheckoutPageClient({ countryCode }: { countryCode: string }) {
  const t = useTranslations()
  const router = useRouter()
  const { cart, isReady, isMutating } = useCart()
  const { customer, isReady: authReady, refresh: refreshAuth } = useAuth()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addressSource, setAddressSource] = useState<"account" | "custom">(
    "account"
  )

  // customer fields
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [country, setCountry] = useState("rs")
  const [city, setCity] = useState("")
  const [postalCode, setPostalCode] = useState("")
  const [notes, setNotes] = useState("")
  const [address1, setAddress1] = useState("")
  const [consent, setConsent] = useState(false)
  const [validated, setValidated] = useState(false)
  const [otherCity, setOtherCity] = useState(false)
  const fields = { firstName, lastName, email, phone, country, city, postalCode, address1, notes, consent }
  const fieldErrors = validated ? checkoutErrors(fields) : {}
  const fieldProps = (name: string) => ({ id: `checkout-${name}`, name, "aria-invalid": Boolean(fieldErrors[name]), "aria-describedby": fieldErrors[name] ? `checkout-${name}-error` : undefined })
  const fieldError = (name: string) => fieldErrors[name] ? <span id={`checkout-${name}-error`} className="field-error">{t(`auth.validation.${fieldErrors[name]}`)}</span> : null

  const [shippingOptions, setShippingOptions] = useState<
    { id: string; name?: string; amount?: number; price_type?: string }[]
  >([])
  const [selectedShipping, setSelectedShipping] = useState<string>("")
  const [quotedCart, setQuotedCart] = useState<HttpTypes.StoreCart | null>(null)

  const [paymentAttempt, setPaymentAttempt] = useState(0)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState(false)
  const [paymentProviders, setPaymentProviders] = useState<{ id: string }[]>([])
  const providers = useMemo(() => pickProviders(paymentProviders), [paymentProviders])
  const [preparedAddress, setPreparedAddress] = useState("")
  const submitLock = useRef(false)
  const addressKey = JSON.stringify([firstName, lastName, email, phone, country, city, postalCode, address1, notes, cart?.items?.map(item => [item.id, item.quantity])])
  const deliveryPrepared = preparedAddress === addressKey

  useEffect(() => {
    if (!authReady) return
    void refreshAuth().catch(() => setError(t("checkout.failed")))
  }, [authReady, refreshAuth, t])

  useEffect(() => {
    if (!authReady || !customer || addressSource !== "account") return
    const v = customerToCheckoutForm(
      customer as unknown as Record<string, unknown>,
      countryCode
    )
    setEmail(v.email)
    setFirstName(v.firstName)
    setLastName(v.lastName)
    setPhone(v.phone)
    setCountry(v.country)
    setCity(v.city)
    setOtherCity(Boolean(v.city && !registrationCities.includes(v.city)))
    setPostalCode(v.postalCode)
    setAddress1(v.address1)
    setNotes(v.notes)
    // Only re-fill when login identity or mode changes, not on every customer refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- customer is read intentionally when id/mode changes
  }, [authReady, customer?.id, addressSource, countryCode])

  useEffect(() => {
    if (!authReady || !customer || addressSource !== "custom") return
    const v = emptyCheckoutForm(countryCode)
    setEmail(v.email)
    setFirstName(v.firstName)
    setLastName(v.lastName)
    setPhone(v.phone)
    setCountry(v.country)
    setCity(v.city)
    setOtherCity(Boolean(v.city && !registrationCities.includes(v.city)))
    setPostalCode(v.postalCode)
    setAddress1(v.address1)
    setNotes(v.notes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, customer?.id, addressSource, countryCode])

  useEffect(() => {
    if (!isReady || !cart?.region_id) return
    let cancelled = false
    ;(async () => {
      try {
        setPaymentLoading(true)
        setPaymentError(false)
        const pp = await listPaymentProviders(cart.region_id!)
        if (!cancelled) setPaymentProviders(pp)
      } catch { if (!cancelled) setPaymentError(true) }
      finally { if (!cancelled) setPaymentLoading(false) }
    })()
    return () => {
      cancelled = true
    }
  }, [isReady, cart?.region_id, t, paymentAttempt])

  if (!isReady || !authReady) {
    return (
      <div className="rounded border border-[var(--store-border)] bg-white p-6 text-sm text-[var(--store-text-muted)]">
        {t("checkout.loading")}
      </div>
    )
  }

  if (!cart?.items?.length) {
    return (
      <div className="rounded border border-[var(--store-border)] bg-white p-6">
        <h1 className="text-xl font-semibold text-[var(--store-text)]">
          {t("checkout.title")}
        </h1>
        <p className="mt-2 text-sm text-[var(--store-text-muted)]">
          {t("checkout.emptyCart")}
        </p>
      </div>
    )
  }

  const canCod = Boolean(providers.system)

  return (
    <div className="checkout-layout">
      <div className="checkout-heading">
        <h1 className="commerce-title">
          {t("checkout.title")}
        </h1>
        <p className="mt-4 text-sm text-[var(--store-text-muted)]">
          {customer
            ? t("checkout.loggedInHint")
            : t("checkout.guestHint")}
        </p>
        {!customer && <div className="mt-5 flex flex-wrap items-center gap-3" aria-label={t("checkout.guestChoice")}>
          <button type="button" className="button-primary" onClick={() => {
            const input = document.querySelector<HTMLInputElement>("#checkout-form input")
            input?.focus(); input?.scrollIntoView({ behavior: "smooth", block: "center" })
          }}>{t("checkout.continueGuest")}</button>
          <Link className="button-secondary" href={`/${countryCode}/account/login?next=checkout`}>{t("checkout.loginInstead")}</Link>
        </div>}
      </div>

      <form
        id="checkout-form"
        className="checkout-form"
        noValidate
        aria-busy={loading}
        onSubmit={async (e) => {
          e.preventDefault()
          if (submitLock.current || isMutating) return
          const errors = checkoutErrors(fields)
          setValidated(true)
          if (Object.keys(errors).length) {
            document.getElementById(`checkout-${Object.keys(errors)[0]}`)?.focus()
            return
          }
          submitLock.current = true
          setLoading(true)
          setError(null)
          try {
            // 1) set addresses + email
            await setCartAddresses({
              cartId: cart.id,
              email: email.trim(),
              shipping_address: {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                address_1: address1.trim(),
                city: city.trim() || undefined,
                postal_code: postalCode.trim(),
                country_code: country,
                phone: normalizePhone(phone),
              },
              notes: notes.trim() || undefined,
            })

            if (!deliveryPrepared) {
              const options = await listShippingOptions(cart.id)
              setShippingOptions(options)
              setSelectedShipping(options[0]?.id ?? "")
              if (!options.length) {
                setPreparedAddress("")
                throw new Error(t("checkout.noShipping"))
              }
              const { cart: quoted } = await setShippingMethod({ cartId: cart.id, optionId: options[0].id })
              setQuotedCart(quoted)
              setPreparedAddress(addressKey)
              return
            }
            if (!selectedShipping || !shippingOptions.some(option => option.id === selectedShipping)) throw new Error(t("checkout.shippingRequired"))
            if (!providers.system) throw new Error(t("checkout.errorCod"))
            const { cart: currentCart } = await setShippingMethod({ cartId: cart.id, optionId: selectedShipping })
            await initiatePaymentSession({ cart: currentCart, providerId: providers.system.id })
            const result = await completeCart(cart.id)
            if (result.type !== "order" || !result.order?.id) throw new Error(t("checkout.failed"))
            saveReceipt(result.order)
            clearCartId()
            router.push(`/${countryCode}/order/${result.order.id}`)
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : t("checkout.failed"))
          } finally {
            submitLock.current = false
            setLoading(false)
          }
        }}
      >
        <fieldset disabled={loading || isMutating} className="checkout-fields">
        {customer ? (
          <div className="mb-6 rounded border border-[var(--store-border)] bg-[var(--store-bg)] p-4">
            <p className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.addressSourceLabel")}
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--store-text)]">
                <input
                  type="radio"
                  name="addressSource"
                  checked={addressSource === "account"}
                  onChange={() => setAddressSource("account")}
                  className="h-4 w-4 shrink-0"
                />
                {t("checkout.useAccountDetails")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--store-text)]">
                <input
                  type="radio"
                  name="addressSource"
                  checked={addressSource === "custom"}
                  onChange={() => setAddressSource("custom")}
                  className="h-4 w-4 shrink-0"
                />
                {t("checkout.useNewDetails")}
              </label>
            </div>
            {addressSource === "account" &&
            !customerHasSavedAddressRecord(
              customer as unknown as Record<string, unknown>
            ) ? (
              <p className="mt-3 text-sm text-amber-800">
                {t("checkout.accountNoAddressHint")}
              </p>
            ) : null}
          </div>
        ) : null}

        <h2 className="checkout-section-title">
          {t("checkout.customer")}
        </h2>

        <div className="checkout-field-row">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.firstName")}
            </span>
            <input {...fieldProps("firstName")} autoComplete="given-name" maxLength={100} value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="h-12 rounded border border-[var(--store-border)] px-3 text-sm" />
            {fieldError("firstName")}
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.lastName")}
            </span>
            <input {...fieldProps("lastName")} autoComplete="family-name" maxLength={100} value={lastName} onChange={(e) => setLastName(e.target.value)} required className="h-12 rounded border border-[var(--store-border)] px-3 text-sm" />
            {fieldError("lastName")}
          </label>
        </div>

        <div className="checkout-field-row">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.email")}
            </span>
            <input {...fieldProps("email")} autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value.replace(/\s/g, ""))} type="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" required className="h-12 rounded border border-[var(--store-border)] px-3 text-sm" />
            {fieldError("email")}
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.phone")}
            </span>
            <input {...fieldProps("phone")} autoComplete="tel" maxLength={25} value={phone} type="tel" inputMode="tel" placeholder="+381 64 123 4567" onBlur={() => setPhone(formatPhone(phone))} onChange={(e) => setPhone(e.target.value.replace(/[^+0-9 ()-]/g, ""))} required className="h-12 rounded border border-[var(--store-border)] px-3 text-sm" />
            {fieldError("phone")}
          </label>
        </div>

        <h2 className="checkout-section-title mt-8">
          {t("checkout.delivery")}
        </h2>

        <div className="checkout-field-row">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.country")}
            </span>
            <select {...fieldProps("country")} autoComplete="country" value={country} onChange={(e) => setCountry(e.target.value)} required className="h-12 rounded border border-[var(--store-border)] px-3 text-sm">
              <option value="rs">{t("countries.rs")}</option>
            </select>
            {fieldError("country")}
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.postalCode")}
            </span>
            <input {...fieldProps("postalCode")} autoComplete="postal-code" maxLength={5} value={postalCode} inputMode="numeric" onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))} required className="h-12 rounded border border-[var(--store-border)] px-3 text-sm" />
            {fieldError("postalCode")}
          </label>
        </div>

        <div className="checkout-field-row">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.city")}
            </span>
            <select {...(!otherCity ? fieldProps("city") : { id: "checkout-city-choice" })} aria-label={t("checkout.city")} autoComplete="address-level2" value={otherCity ? "__other" : city} onChange={e => { setOtherCity(e.target.value === "__other"); setCity(e.target.value === "__other" ? "" : e.target.value) }} required>
              <option value="">{t("auth.validation.chooseCity")}</option>
              {registrationCities.map(name => <option key={name} value={name}>{name}</option>)}
              <option value="__other">{t("auth.validation.otherCity")}</option>
            </select>
            {!otherCity && fieldError("city")}
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.address")}
            </span>
            <input {...fieldProps("address1")} autoComplete="address-line1" maxLength={200} value={address1} onChange={(e) => setAddress1(e.target.value)} required className="h-12 rounded border border-[var(--store-border)] px-3 text-sm" />
            {fieldError("address1")}
          </label>
        </div>

        {otherCity && <label className="mt-4 grid gap-1"><span>{t("auth.validation.cityName")} *</span><input {...fieldProps("city")} autoComplete="address-level2" value={city} maxLength={100} onChange={e => setCity(e.target.value)} required />{fieldError("city")}</label>}

        <label className="mt-4 grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            {t("checkout.notes")}
          </span>
          <textarea {...fieldProps("notes")} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-24 rounded border border-[var(--store-border)] px-3 py-2 text-sm" />
          {fieldError("notes")}
        </label>

        <h2 className="checkout-section-title mt-8">
          {t("checkout.shipping")}
        </h2>
        <div className="mt-4 grid gap-2">
          {deliveryPrepared && shippingOptions.length ? (
            shippingOptions.map((o) => (
              <label key={o.id} className="flex items-center gap-3 rounded border border-[var(--store-border)] px-3 py-3">
                <input
                  type="radio"
                  name="shipping"
                  value={o.id}
                  checked={selectedShipping === o.id}
                  disabled={loading || isMutating}
                  onChange={async () => {
                    if (submitLock.current) return
                    submitLock.current = true; setLoading(true); setError(null)
                    try {
                      const { cart: quoted } = await setShippingMethod({ cartId: cart.id, optionId: o.id })
                      setQuotedCart(quoted); setSelectedShipping(o.id)
                    } catch { setError(t("checkout.failed")) }
                    finally { submitLock.current = false; setLoading(false) }
                  }}
                />
                <span className="text-sm text-[var(--store-text)]">
                  {o.name || o.id}{typeof o.amount === "number" ? ` — ${formatMoney(o.amount, cart.currency_code)}` : ""}
                </span>
              </label>
            ))
          ) : (
            <div className="text-sm text-[var(--store-text-muted)]">
              {t(deliveryPrepared ? "checkout.noShipping" : "checkout.prepareDelivery")}
            </div>
          )}
        </div>

        <h2 className="checkout-section-title mt-8">
          {t("checkout.payment")}
        </h2>
        <div className="mt-4 grid gap-2">
          {(paymentError || !paymentProviders.length) && <button type="button" disabled={paymentLoading || loading} onClick={() => setPaymentAttempt(n => n + 1)} className="rounded border px-4 py-2">{t("checkout.retryPayment")}</button>}
          <label className="flex items-center gap-3 rounded border border-[var(--store-border)] px-3 py-3">
            <input
              type="radio"
              name="payment"
              value="cod"
              checked={canCod}
              readOnly
              disabled={!canCod}
            />
            <span className="text-sm text-[var(--store-text)]">
              {t("checkout.paymentCod")}
            </span>
          </label>
          {!paymentProviders.length ? (
            <div className="text-sm text-[var(--store-text-muted)]">
              {t("checkout.noPaymentProviders")}
            </div>
          ) : null}
        </div>

        </fieldset>
        {error ? (
          <div role="alert" className="mt-6 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

      </form>
      <aside className="order-summary">
        <h2>{t("design.summary")}</h2>
        <ul className="my-6 space-y-3 border-b border-[var(--store-border)] pb-6 text-sm">{cart.items.map(item => <li key={item.id} className="flex justify-between gap-4"><span>{item.product_title || item.title} × {item.quantity}</span><span className="shrink-0">{formatMoney(item.total ?? item.unit_price * item.quantity, cart.currency_code)}</span></li>)}</ul>
        <div className="flex justify-between gap-4 text-sm"><span>{t("design.productsSubtotal")}</span><strong>{formatMoney(cart.item_total ?? cart.item_subtotal ?? cart.subtotal ?? 0, cart.currency_code)}</strong></div>
        {deliveryPrepared && quotedCart && <><div className="mt-4 flex justify-between gap-4 text-sm"><span>{t("checkout.shipping")}</span><span>{formatMoney(quotedCart.shipping_total, cart.currency_code)}</span></div><div className="mt-6 flex justify-between gap-4 border-t border-[var(--store-border)] pt-6 text-lg font-semibold"><span>{t("design.total")}</span><span>{formatMoney(quotedCart.total, cart.currency_code)}</span></div></>}
        <p className="mt-4 text-xs text-[var(--store-text-muted)]">{deliveryPrepared ? t("checkout.shipping") + ": " + (shippingOptions.find(option => option.id === selectedShipping)?.name || t("checkout.shippingRequired")) : t("design.shippingLater")}</p>
        <div className="registration-consent mt-6">
          <input {...fieldProps("consent")} form="checkout-form" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={loading || isMutating} required />
          <label htmlFor="checkout-consent">{t("auth.validation.agree")} <Link href="/terms" target="_blank">{t("auth.validation.terms")}</Link> {t("auth.validation.and")} <Link href="/privacy" target="_blank">{t("auth.validation.privacy")}</Link>.</label>
        </div>
        {fieldError("consent")}

        <button
          type="submit"
          form="checkout-form"
          disabled={loading || paymentLoading || isMutating || (deliveryPrepared && (!canCod || !selectedShipping || !quotedCart))}
          className="button-primary checkout-submit mt-8 w-full disabled:opacity-60"
        >
          {loading ? t(deliveryPrepared ? "checkout.placingOrder" : "checkout.preparingDelivery") : t(deliveryPrepared ? "checkout.placeOrder" : "checkout.prepareDelivery")}
        </button>
      </aside>
    </div>
  )
}

