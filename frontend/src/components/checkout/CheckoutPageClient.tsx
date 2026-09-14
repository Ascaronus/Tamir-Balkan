"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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

  const [shippingOptions, setShippingOptions] = useState<
    { id: string; name?: string; amount?: number; price_type?: string }[]
  >([])
  const [selectedShipping, setSelectedShipping] = useState<string>("")

  const [paymentProviders, setPaymentProviders] = useState<{ id: string }[]>([])
  const providers = useMemo(() => pickProviders(paymentProviders), [paymentProviders])
  const [preparedAddress, setPreparedAddress] = useState("")
  const submitLock = useRef(false)
  const addressKey = JSON.stringify([firstName, lastName, email, phone, country, city, postalCode, address1, notes, cart?.items?.map(item => [item.id, item.quantity])])
  const deliveryPrepared = preparedAddress === addressKey

  useEffect(() => {
    if (!authReady) return
    void refreshAuth()
  }, [authReady, refreshAuth])

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
        const pp = await listPaymentProviders(cart.region_id!)
        if (!cancelled) setPaymentProviders(pp)
      } catch { if (!cancelled) setError(t("checkout.noPaymentProviders")) }
    })()
    return () => {
      cancelled = true
    }
  }, [isReady, cart?.region_id, t])

  if (!isReady) {
    return (
      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6 text-sm text-[var(--store-text-muted)]">
        {t("checkout.loading")}
      </div>
    )
  }

  if (!cart?.items?.length) {
    return (
      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
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
    <div className="grid gap-6">
      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
        <h1 className="text-xl font-semibold text-[var(--store-text)]">
          {t("checkout.title")}
        </h1>
        <p className="mt-1 text-sm text-[var(--store-text-muted)]">
          {customer
            ? t("checkout.loggedInHint")
            : t("checkout.guestHint")}
        </p>
      </div>

      <form
        className="rounded-2xl border border-[var(--store-border)] bg-white p-6"
        onSubmit={async (e) => {
          e.preventDefault()
          if (submitLock.current) return
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
                phone: phone.trim(),
              },
              notes: notes.trim() || undefined,
            })

            if (!deliveryPrepared) {
              const options = await listShippingOptions(cart.id)
              setShippingOptions(options)
              setSelectedShipping(options[0]?.id ?? "")
              setPreparedAddress(addressKey)
              if (!options.length) throw new Error(t("checkout.noShipping"))
              return
            }
            if (!selectedShipping || !shippingOptions.some(option => option.id === selectedShipping)) throw new Error(t("checkout.shippingRequired"))
            if (!providers.system) throw new Error(t("checkout.errorCod"))
            const { cart: currentCart } = await setShippingMethod({ cartId: cart.id, optionId: selectedShipping })
            await initiatePaymentSession({ cart: currentCart, providerId: providers.system.id })
            const result = await completeCart(cart.id)
            if (result.type !== "order" || !result.order?.id) throw new Error(t("checkout.failed"))
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
        {customer ? (
          <div className="mb-6 rounded-xl border border-[var(--store-border)] bg-[var(--store-bg)] p-4">
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

        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--store-text-muted)]">
          {t("checkout.customer")}
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.firstName")}
            </span>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.lastName")}
            </span>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.email")}
            </span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.phone")}
            </span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-[var(--store-text-muted)]">
          {t("checkout.delivery")}
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.country")}
            </span>
            <select value={country} onChange={(e) => setCountry(e.target.value)} required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm">
              <option value="rs">{t("countries.rs")}</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.postalCode")}
            </span>
            <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.city")}
            </span>
            <input value={city} onChange={(e) => setCity(e.target.value)} required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">
              {t("checkout.address")}
            </span>
            <input value={address1} onChange={(e) => setAddress1(e.target.value)} required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
        </div>

        <label className="mt-4 grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">
            {t("checkout.notes")}
          </span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-24 rounded-xl border border-[var(--store-border)] px-3 py-2 text-sm" />
        </label>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-[var(--store-text-muted)]">
          {t("checkout.shipping")}
        </h2>
        <div className="mt-4 grid gap-2">
          {deliveryPrepared && shippingOptions.length ? (
            shippingOptions.map((o) => (
              <label key={o.id} className="flex items-center gap-3 rounded-xl border border-[var(--store-border)] px-3 py-3">
                <input
                  type="radio"
                  name="shipping"
                  value={o.id}
                  checked={selectedShipping === o.id}
                  onChange={() => setSelectedShipping(o.id)}
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

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-[var(--store-text-muted)]">
          {t("checkout.payment")}
        </h2>
        <div className="mt-4 grid gap-2">
          <label className="flex items-center gap-3 rounded-xl border border-[var(--store-border)] px-3 py-3">
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

        {error ? (
          <div className="mt-6 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading || isMutating || (deliveryPrepared && (!canCod || !selectedShipping))}
          className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-full bg-[var(--store-text)] px-6 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? t(deliveryPrepared ? "checkout.placingOrder" : "checkout.preparingDelivery") : t(deliveryPrepared ? "checkout.placeOrder" : "checkout.prepareDelivery")}
        </button>
      </form>
    </div>
  )
}

