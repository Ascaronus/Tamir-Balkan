"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useCart } from "@/components/cart/CartProvider"
import {
  completeCart,
  initiatePaymentSession,
  listPaymentProviders,
  listShippingOptions,
  setCartAddresses,
  setShippingMethod,
} from "@/lib/checkout/checkout-client"

type PaymentChoice = "cod" | "stripe"

function pickProviders(paymentProviders: { id: string }[]) {
  const stripe = paymentProviders.find((p) => p.id.toLowerCase().includes("stripe"))
  const system = paymentProviders.find((p) =>
    p.id.toLowerCase().includes("system")
  )
  return { stripe, system }
}

export function CheckoutPageClient({ countryCode }: { countryCode: string }) {
  const router = useRouter()
  const { cart, isReady, isMutating, refresh } = useCart()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // customer fields
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [country, setCountry] = useState(countryCode.toLowerCase() === "me" ? "me" : "rs")
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
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("cod")

  useEffect(() => {
    if (!isReady || !cart?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const opts = await listShippingOptions(cart.id)
        if (!cancelled) {
          setShippingOptions(opts as any)
          if (opts?.length && !selectedShipping) {
            setSelectedShipping(opts[0].id)
          }
        }
      } catch {}
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, cart?.id])

  useEffect(() => {
    if (!isReady || !cart?.region_id) return
    let cancelled = false
    ;(async () => {
      try {
        const pp = await listPaymentProviders(cart.region_id!)
        if (!cancelled) setPaymentProviders(pp as any)
      } catch {}
    })()
    return () => {
      cancelled = true
    }
  }, [isReady, cart?.region_id])

  if (!isReady) {
    return (
      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6 text-sm text-[var(--store-text-muted)]">
        Loading…
      </div>
    )
  }

  if (!cart?.items?.length) {
    return (
      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
        <h1 className="text-xl font-semibold text-[var(--store-text)]">Checkout</h1>
        <p className="mt-2 text-sm text-[var(--store-text-muted)]">
          Your cart is empty.
        </p>
      </div>
    )
  }

  const canStripe = Boolean(providers.stripe)
  const canCod = Boolean(providers.system)

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
        <h1 className="text-xl font-semibold text-[var(--store-text)]">Checkout</h1>
        <p className="mt-1 text-sm text-[var(--store-text-muted)]">
          You can place an order without registration.
        </p>
      </div>

      <form
        className="rounded-2xl border border-[var(--store-border)] bg-white p-6"
        onSubmit={async (e) => {
          e.preventDefault()
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
                address_1: address1.trim() || "-",
                city: city.trim() || undefined,
                postal_code: postalCode.trim(),
                country_code: country,
                phone: phone.trim(),
              },
              notes: notes.trim() || undefined,
            })

            // 2) shipping method
            if (selectedShipping) {
              await setShippingMethod({ cartId: cart.id, optionId: selectedShipping })
            }

            // 3) payment session
            const refreshedCart = (await refresh(), (await (async () => cart)()))
            const currentCart = refreshedCart || cart

            if (paymentChoice === "cod") {
              if (!providers.system) {
                throw new Error("Payment on delivery is not configured in this region.")
              }
              await initiatePaymentSession({
                cart: currentCart as any,
                providerId: providers.system.id,
              })
            } else {
              if (!providers.stripe) {
                throw new Error("Stripe is not configured in this region.")
              }
              await initiatePaymentSession({
                cart: currentCart as any,
                providerId: providers.stripe.id,
              })
              // Stripe requires client-side confirmation flow; we'll add it next.
              throw new Error("Stripe flow is not wired yet. Choose 'Payment on delivery' for now.")
            }

            // 4) complete cart → order
            const result = await completeCart(cart.id)
            if (result?.type === "order" && result?.order?.id) {
              router.push(`/${countryCode}/order/${result.order.id}`)
              return
            }
            router.push(`/${countryCode}/catalog`)
          } catch (e: any) {
            setError(e?.message || "Checkout failed")
          } finally {
            setLoading(false)
          }
        }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--store-text-muted)]">
          Customer
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">First name *</span>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">Last name *</span>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">Email *</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">Phone *</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-[var(--store-text-muted)]">
          Delivery
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">Country *</span>
            <select value={country} onChange={(e) => setCountry(e.target.value)} required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm">
              <option value="rs">Serbia</option>
              <option value="me">Montenegro</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">Postal code *</span>
            <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">City</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-[var(--store-text)]">Address *</span>
            <input value={address1} onChange={(e) => setAddress1(e.target.value)} required className="h-11 rounded-xl border border-[var(--store-border)] px-3 text-sm" />
          </label>
        </div>

        <label className="mt-4 grid gap-1">
          <span className="text-sm font-medium text-[var(--store-text)]">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-24 rounded-xl border border-[var(--store-border)] px-3 py-2 text-sm" />
        </label>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-[var(--store-text-muted)]">
          Shipping
        </h2>
        <div className="mt-4 grid gap-2">
          {shippingOptions.length ? (
            shippingOptions.map((o: any) => (
              <label key={o.id} className="flex items-center gap-3 rounded-xl border border-[var(--store-border)] px-3 py-3">
                <input
                  type="radio"
                  name="shipping"
                  value={o.id}
                  checked={selectedShipping === o.id}
                  onChange={() => setSelectedShipping(o.id)}
                />
                <span className="text-sm text-[var(--store-text)]">
                  {o.name || o.id}
                </span>
              </label>
            ))
          ) : (
            <div className="text-sm text-[var(--store-text-muted)]">
              No shipping options. Configure them in Medusa Admin (Settings → Regions).
            </div>
          )}
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-[var(--store-text-muted)]">
          Payment
        </h2>
        <div className="mt-4 grid gap-2">
          <label className="flex items-center gap-3 rounded-xl border border-[var(--store-border)] px-3 py-3">
            <input
              type="radio"
              name="payment"
              value="cod"
              checked={paymentChoice === "cod"}
              onChange={() => setPaymentChoice("cod")}
              disabled={!canCod}
            />
            <span className="text-sm text-[var(--store-text)]">
              Payment on delivery
            </span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-[var(--store-border)] px-3 py-3">
            <input
              type="radio"
              name="payment"
              value="stripe"
              checked={paymentChoice === "stripe"}
              onChange={() => setPaymentChoice("stripe")}
              disabled={!canStripe}
            />
            <span className="text-sm text-[var(--store-text)]">Card (Stripe)</span>
          </label>
          {!paymentProviders.length ? (
            <div className="text-sm text-[var(--store-text-muted)]">
              Payment providers are not available. Ensure your publishable key has a sales channel and providers are enabled for the region.
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
          disabled={loading || isMutating}
          className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-full bg-[var(--store-text)] px-6 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Placing order…" : "Place order"}
        </button>
      </form>
    </div>
  )
}

